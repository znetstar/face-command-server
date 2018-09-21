import { IFaceManagementService, Face } from "face-command-common";
import AppResources from "./AppResources";
import {
    CascadeClassifier,
    HAAR_FRONTALFACE_ALT2,
    Rect,
    imdecodeAsync,
    Mat,
    COLOR_GRAY2RGB,
    VideoCapture,
    INTER_CUBIC
} from "opencv4nodejs";

/**
 * This error is thrown when no faces are detected in the source image.
 */
export class NoFacesDetectedError extends Error {
    constructor() {
        super("No faces were detected in the source image");
    }
}

/**
 * This error is thrown when multiple faces are detected in the source image.
 */
export class TooManyFacesError extends Error {
    constructor() {
        super("More than one face was found in the source image");
    }
}

/**
 * This service handles managing (adding, removing, updating, etc) faces.
 */
export default class FaceManagementService implements IFaceManagementService {
    static faceClassifier: CascadeClassifier = new CascadeClassifier(HAAR_FRONTALFACE_ALT2);

    /**
     * Creates a `FaceManagementService` object.
     * @param resources - Contains the application resources (database, logger, etc).
     */
    constructor(protected resources: AppResources) {
    }

    /**
     * Extracts faces from a provided image. 
     * @param source - Image to extract from.
     * @returns - An array of grayscale images containing each face detected. 
     */
    public static async FacesFromImage(source: Buffer): Promise<Buffer[]> {
        const grayImage = await imdecodeAsync(source)
                                .then((image) => image.bgrToGray());

        const { objects } = await FaceManagementService.faceClassifier.detectMultiScaleAsync(grayImage, 1.1, 10);
        const faceImages = await Promise.all<Buffer>(objects.map(async (bounds: Rect) => {
            const mask = new Mat(bounds.width, bounds.height, COLOR_GRAY2RGB);
            return await grayImage.copyAsync(mask)
                                  .then((mat) => mat.getDataAsync());
        }));
        return faceImages;
    }

    /** 
     * Extracts a single face from an image.
     * @param source - Image to extract from.
     * @returns - A grayscale image containing the extracted face.
     * @throws {NoFacesDetectedError|TooManyFacesError} - If no faces or more than one face is detected.
     */
    public static async FaceFromImage(source: Buffer): Promise<Buffer> {
        const faces = await FaceManagementService.FacesFromImage(source);
        if (faces.length < 1) {
            throw new NoFacesDetectedError();
        }
        else if (faces.length > 1) {
            throw new TooManyFacesError();
        }

        return faces[0];
    }

    /**
     * Operations that should be run each face image before adding it to the database.
     * 
     * @param image - The face image to preprocess.
     * @returns - The preprocessed image.
     */
    protected async PreprocessFace(image: Buffer): Promise<Buffer> {
        const { Nconf } = this.resources;
        let mat = await imdecodeAsync(image);

        // Resize face
        mat = await mat.resizeAsync(Nconf.get("imageSize:width"), Nconf.get("imageSize:height"), INTER_CUBIC);

        return await mat.getDataAsync();
    }

    /**
     * Takes a frame from the capture source.
     * @param devicePort - Which device to capture from.
     * @returns - A single image from the capture source.
     */
    public static async ImageFromCamera(devicePort: number): Promise<Buffer> {
        const captureSource = new VideoCapture(devicePort);
        let mat = await captureSource.readAsync();
        return await mat.getDataAsync();
    }

    public async AddFace(image: Buffer, name: string, autostart: boolean = false, skipDetection: boolean = false): Promise<Face> {
        const { Database, Logger, Nconf } = this.resources;
        try {
            if (!skipDetection) {
                image = await FaceManagementService.FaceFromImage(image);
            }

            image = await this.PreprocessFace(image);

            const dbFace = await Database.Face.create({
                Name: name,
                Autostart: autostart,
                Image: image
            });

            const face = new Face(
                dbFace.ID,
                dbFace.Name,
                dbFace.Image,
                dbFace.Autostart
            );

            return face;
        }
        catch (error) {
            Logger.error(`Error adding face: ${error.message}`);
            throw error;
        }
    }

    public async AddFaceFromCamera(name: string, autostart: boolean = false): Promise<Face> {
        const { Logger, Nconf } = this.resources;
        try {
            Logger.verbose("Attempting to add a face from the capture source");
            const image = await FaceManagementService.ImageFromCamera(Nconf.get("captureDevicePort"));
            return await this.AddFace(image, name, autostart, true);
        } catch (error) {
            Logger.error(`Error adding face from the capture source: ${error.message}`);
            throw error;
        }
    }

    public async GetFace(faceId: number): Promise<Face> {
        const { Logger, Database } = this.resources;
        try {
            let dbFace = await Database.Face.findById(faceId);
            return new Face(
                dbFace.ID,
                dbFace.Name,
                dbFace.Image,
                dbFace.Autostart
            );
        } catch (error) {
            Logger.error(`Error retrieving face "${faceId}": ${error.message}`);
            throw error;
        }
    }

    public async GetFaces(): Promise<Face[]>{
        const { Logger, Database } = this.resources;
        try {
            let dbFaces = await Database.Face.findAll();
            return dbFaces.map((dbFace) => {
                return new Face(
                    dbFace.ID,
                    dbFace.Name,
                    dbFace.Image,
                    dbFace.Autostart
                );
            });
        } catch (error) {
            Logger.error(`Error retrieving faces: ${error.message}`);
            throw error;
        }      
    }  

    public async RemoveFace(faceId: number): Promise<any> {
        const { Logger, Database } = this.resources;
        try {
            await Database.Face.destroy({
                where: {
                    ID: faceId
                }
            });
        } catch (error) {
            Logger.error(`Error removing face ${faceId}: ${error.message}`);
            throw error;
        }     
    }

    public async UpdateFace(face: Face, scanForFace: boolean = false, imageFromCamera: boolean = false) {
        const { Logger, Database, Nconf } = this.resources;
        try {
            let newFace = face.Image;
            if (imageFromCamera) {
                newFace = await FaceManagementService.ImageFromCamera(Nconf.get("captureDevicePort"));
            } 
            if (imageFromCamera || scanForFace) {
                face.Image = await FaceManagementService.FaceFromImage(newFace);
            }
            await Database.Face.update(face);
        } catch (error) {
            Logger.error(`Error updating face: ${error.message}`);
            throw error;
        }     
    }
}