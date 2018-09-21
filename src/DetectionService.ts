import { EventEmitter } from "eventemitter3";
import {
    EigenFaceRecognizer,
    imdecode,
    Mat,
    INTER_CUBIC,
    imdecodeAsync,
    COLOR_RGB2GRAY
} from "opencv4nodejs";
import { IDetectionService, Status, StatusType, DetectionOptions, Face } from "face-command-common";
import AppResources from "./AppResources";
import FaceManagementService from "./FaceManagementService";
import { Op } from "sequelize";

export default class DetectionService extends EventEmitter implements IDetectionService {
    protected detectionTimeout: number;
    protected lastStatus: Status = null;

    constructor(protected resources: AppResources) {
        super();
        
        this.on('StatusChange', this.LogStatusChange.bind(this));
    }

    protected LogStatusChange(status: Status): void {
        this.resources.Logger.info(`A status change has occured: ${status}`);
    } 

    public get IsDetectionRunning(): boolean {
        return (typeof(this.detectionTimeout) === 'number');
    }

    public async AddStatus(statusType: StatusType, time: Date = new Date(), recognizedFaces: Face[] = []): Promise<Status> {
        const { Database } = this.resources;

        const dbStatus = await Database.Status.create({
            StatusType: Number(statusType),
            Time: time
        });
        
        for (let face of recognizedFaces) {
            const dbFace = await Database.Face.findById(face.ID);
            await dbStatus.addFace(dbFace);
        }

        const status = new Status(dbStatus.ID, statusType, time, recognizedFaces);
        /**
         * Is emitted when there has been a status change
         * @param status - The status object.
         * @event
         */
        this.emit("StatusChange", status);
        return status;
    }

    public async GetStatus(id: number): Promise<Status> {
        const { Database } = this.resources;

        const dbStatus = await Database.Status.findById(id);
        const status = new Status(
            dbStatus.ID,
            dbStatus.StatusType,
            dbStatus.Time
        );
        
        const dbFaces = await dbStatus.getFaces();
        status.RecognizedFaces = dbFaces.map((face: any) => new Face(face.ID, face.Name, face.Image, face.Autostart));
        
        return status;
    }

    public async StatusHistory(start?: Date, end: Date = new Date()): Promise<Status[]> {
        const { Database } = this.resources;

        const dbStatuses = await Database.Status.find({
            where: {
                Time: {
                    [Op.gte]: end,
                    [Op.lte]: start
                }
            }
        });

        return await Promise.all<Status>(
            dbStatuses.map(async (dbStatus: any) => {
                const status = new Status(
                    dbStatus.ID,
                    dbStatus.StatusType,
                    dbStatus.Time
                );
                
                const dbFaces = await dbStatus.getFaces();
                status.RecognizedFaces = dbFaces.map((face: any) => new Face(face.ID, face.Name, face.Image, face.Autostart));
                return status;
            })
        );
    }

    public async DetectChanges(options: DetectionOptions): Promise<any> {
        const { Logger, Nconf, Database } = this.resources;
        const { Faces, EigenFaceRecognizerOptions } = options;

        const recognizer = new EigenFaceRecognizer(EigenFaceRecognizerOptions.Components, EigenFaceRecognizerOptions.Threshold);
        
        const faces = await Promise.all(Faces.map((face) => imdecodeAsync(face.Image)));
        const labels = Faces.map<number>((face, index) => index);

        Logger.debug(`Training recognizer with ${faces.length} faces`);
        await recognizer.trainAsync(faces, labels);

        Logger.verbose("Grabbing frame from capture source");
        const frame = await FaceManagementService.ImageFromCamera(Nconf.get("captureDevicePort"))
                     .then(imdecodeAsync)
                     .then((frame) => frame.bgrToGrayAsync());
        
        Logger.debug("Detecting faces in image");
        const frameBuffer = await frame.getDataAsync();
        const facesDetected = await FaceManagementService.FacesFromImage(frameBuffer)
                                    .then((faces) => Promise.all(faces.map(imdecodeAsync)));

        let statusType: StatusType = StatusType.NoFacesDetected;
        let facesRecognized: Face[];

        if (facesDetected.length) {
            Logger.verbose(`Detected ${facesDetected.length} face(s) in image`);
            statusType = StatusType.FacesDetected;

            if (faces.length) {
                for (let i = 0; i < facesDetected.length; i++) {
                    const faceDetected = facesDetected[i];
                    Logger.debug(`Running prediction for face ${i + 1}`);
                    const result = await recognizer.predictAsync(faceDetected);
                    if (result.label > 0) {
                        statusType = StatusType.FacesRecognized;
                        const faceIndex = result.label;
                        const face = Faces[faceIndex];
                        facesRecognized.push(face);
                        Logger.verbose(`Face with ID "${face.ID}" has been detected in the image.`);
                    }
                }

                if (!facesRecognized.length && this.lastStatus.StatusType === StatusType.FacesRecognized) {
                    statusType = StatusType.FacesNoLongerRecognized;
                }
            }
        } else if (this.lastStatus.StatusType === StatusType.FacesDetected || this.lastStatus.StatusType === StatusType.FacesRecognized) {
            statusType = StatusType.FacesNoLongerDetected;
        }
    }

    public StopDetection(): void {
        clearInterval(this.detectionTimeout);
    }

    public StartDetection(options: DetectionOptions): void {
        this.resources.Logger.info(`Beginning detection with ${options.Faces.length} faces, capturing every ${options.Frequency/1000} seconds`);
        this.detectionTimeout = setInterval(this.DetectChanges.bind(this), options.Frequency, options);
    }
}