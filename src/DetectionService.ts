import {
    EigenFaceRecognizer,
    imdecodeAsync,
} from "opencv4nodejs";
import { Op } from "sequelize";
import { DetectionServiceBase, Status, StatusType, DetectionOptions, Face, EigenFaceRecognizerOptions } from "face-command-common";
import AppResources from "./AppResources";
import { default as DatabaseModels } from "./DatabaseModels";
import FaceCapture from "./FaceCapture";

export default class DetectionService extends DetectionServiceBase {
    protected detectionTimeout: any;
    public lastStatus: Status = null;

    constructor(protected resources: AppResources, protected capture: FaceCapture) {
        super(resources);
        
        this.on('StatusChange', this.LogStatusChange.bind(this));
    }

    protected LogStatusChange(status: Status): void {
        this.resources.logger.verbose(`A change in the detection status has occured: ${status}`);
    } 

    public async IsDetectionRunning(): Promise<boolean> {
        return (typeof(this.detectionTimeout) !== 'undefined') && (this.detectionTimeout !== null);
    }

    public async GetLastStatus(): Promise<Status> {
        return this.lastStatus;
    }

    public async AddStatus(statusType: StatusType, time: Date = new Date(), brightness: number, recognizedFaces: Face[] = []): Promise<Status> {
        const { database } = this.resources;

        const dbStatus = await database.Status.create({
            statusType: Number(statusType),
            time: time
        });
        
        for (let face of recognizedFaces) {
            const dbFace = await database.Face.findById(face.id);
            await dbStatus.addFace(dbFace);
        }

        const status = new Status(dbStatus.id, statusType, time, brightness, recognizedFaces);
        /**
         * Is emitted when there has been a status change
         * @param status - The status object.
         * @event
         */
        this.emit("StatusChange", status);
        return status;
    }

    public async GetStatus(id: number): Promise<Status> {
        const { database } = this.resources;

        const dbStatus = await database.Status.findById(id);
        
        return await DatabaseModels.FromDBStatus(dbStatus);
    }

    public async StatusHistory(start?: Date, end: Date = new Date()): Promise<Status[]> {
        const { database } = this.resources;

        const dbStatuses = await database.Status.find({
            where: {
                time: {
                    [Op.gte]: end,
                    [Op.lte]: start
                }
            }
        });

        return await Promise.all<Status>(
            dbStatuses.map(DatabaseModels.FromDBStatus)
        );
    }

    

    public async DetectChanges(options: DetectionOptions): Promise<any> {
        const { logger, nconf } = this.resources;
        const { faces, eigenFaceRecognizerOptions } = options;
        options.state = options.state || {};

        try {   
            logger.debug("Grabbing frame from capture source");
            let frame = await this.capture.ImageFromCamera();

            frame = await frame.bgrToGrayAsync();

            var statusType: StatusType = +StatusType.NoFacesDetected;
            var facesRecognized: Face[] = [];

            const currentBrightness = await this.capture.GetBrightness(frame);
            const minBrightness = nconf.get("minimumBrightness");
            if (currentBrightness < minBrightness) {
                statusType = +StatusType.BrightnessTooLow;
                let displayBrightness = Math.round(currentBrightness * 100) / 100;
                if (!options.state.brightnessAlert) {
                    logger.warn(`Current brightness ${displayBrightness} is too low to run detection. The minimum is ${minBrightness}`);
                    options.state.brightnessAlert = true;
                    if (this.lastStatus && this.lastStatus.statusType === (+StatusType.FacesDetected || this.lastStatus.statusType === +StatusType.FacesRecognized)) {
                        statusType
                    }
                }
                else
                    logger.debug(`Brightness ${displayBrightness} is still too low to run detection. Minimum is ${minBrightness}`);
            }
            else {
                options.state.brightnessAlert = false;

                frame = await this.capture.StabilizeContrast(frame);

                const loadedFaces = await Promise.all(faces.map((face: Face) => imdecodeAsync(Buffer.from(face.image))));
                const labels = faces.map<number>((face, index) => index);

                let recognizer = options.state.recognizer;
                if (!recognizer && loadedFaces.length) {
                    recognizer = new EigenFaceRecognizer(eigenFaceRecognizerOptions.components, eigenFaceRecognizerOptions.threshold);
                    logger.debug(`Training recognizer with ${faces.length} face(s)`);
                    await recognizer.trainAsync(loadedFaces, labels);
                    options.state.recognizer = recognizer;
                }


                logger.debug("Detecting faces in image");
                const facesDetected = await this.capture.FacesFromImage(frame);

                if (facesDetected.length) {
                    logger.debug(`Detected ${facesDetected.length} face(s) in image`);
                    statusType = +StatusType.FacesDetected;

                    if (loadedFaces.length) {
                        for (let i = 0; i < facesDetected.length; i++) {
                            let faceDetected = facesDetected[i];
                            faceDetected = await this.capture.ResizeFace(faceDetected);

                            logger.debug(`Running prediction for face ${i + 1}`);
                            const result = await recognizer.predictAsync(faceDetected);
                            if (result.label > -1) {
                                statusType = +StatusType.FacesRecognized;
                                const faceIndex = result.label;
                                const face = faces[faceIndex];
                                facesRecognized.push(face);
                                logger.debug(`Face with ID "${face.id}" has been detected in the image.`);
                            }
                        }

                        if (!facesRecognized.length && this.lastStatus && this.lastStatus.statusType === +StatusType.FacesRecognized) {
                            statusType = +StatusType.FacesNoLongerRecognized;
                        }
                    }
                } else if (this.lastStatus && (this.lastStatus.statusType === +StatusType.FacesDetected || this.lastStatus.statusType === +StatusType.FacesRecognized)) {
                    statusType = +StatusType.FacesNoLongerDetected;
                }
            }

            if (!this.lastStatus || ( this.lastStatus.statusType !== statusType )) {
                const status = await this.AddStatus(statusType, new Date(), currentBrightness, facesRecognized);
                this.lastStatus = status;
            }

        } catch (error) {
            logger.error(`An error occured while detecting: ${error}`);
            if (nconf.get("stopOnDetectionError"))
                this.StopDetection();
        }
    }

    public StopDetection(): void {
        clearInterval(this.detectionTimeout);
        this.detectionTimeout = null;
        this.resources.logger.info("Detection stopped");
        this.emit("DetectionRunning", false);
    }

    public async RPC_StartDetection(inputOptions: any): Promise<void> {
        const { database } = this.resources;
        const eigenFaceRecognizerOptions = new EigenFaceRecognizerOptions(inputOptions.eigenFaceRecognizerOptions.components, inputOptions.eigenFaceRecognizerOptions.threshold);
        
        const faces = await Promise.all<Face>(inputOptions.faces.map(async (faceId: number): Promise<Face> => {
            const dbFace = await database.Face.findById(faceId);
            return DatabaseModels.FromDBFace(dbFace);
        }));
        
        const options = new DetectionOptions(inputOptions.frequency, eigenFaceRecognizerOptions, faces, inputOptions.autostartFaces);

        return this.StartDetection(options);
    }

    public async StartDetection(options: DetectionOptions): Promise<void> {
        const { database } = this.resources; 
        this.resources.logger.info(`Beginning detection with ${options.faces.length} face(s), capturing every ${options.frequency/1000} seconds`);

        if (options.autostartFaces) {
            const dbFaces = await database.Face.findAll({
                where: {
                    autostart: true
                }
            });

            options.faces = await Promise.all(dbFaces.map(DatabaseModels.FromDBFace));
        }   

        
        this.detectionTimeout = setInterval(this.DetectChanges.bind(this), options.frequency, options);
        
        this.emit("DetectionRunning", true);
    }
}