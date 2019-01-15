import { FaceManagementServiceBase, Face } from "face-command-common";
import {
    imdecodeAsync,
    Mat,
    imencodeAsync,
} from "opencv4nodejs";
import AppResources from "./AppResources";
import { default as FaceCapture, ImageBelowBrightnessThresholdError } from "./FaceCapture";
import { default as DatabaseModels } from "./DatabaseModels";

/**
 * This service handles managing (adding, removing, updating, etc) faces.
 */
export default class FaceManagementService extends FaceManagementServiceBase {
    /**
     * Creates a `FaceManagementService` object.
     * @param resources - Contains the application resources (database, logger, etc).
     */
    constructor(protected resources: AppResources, protected capture: FaceCapture) {
        super(resources);
    }

    /**
     * Adds a face to the database, scanning the provided image for a face.
     * @param inputImage - Image to add.
     * @param name - Friendly name of the face.
     * @param autostart - Whether the face should be loaded on application start. 
     * @param skipDetection - If true, will skip scanning the provided image for a face.
     */
    public async AddFace(inputImage: Uint8Array|Mat, name: string, autostart: boolean = false, skipDetection: boolean = false): Promise<Face> {
        const { database, logger, nconf } = this.resources;
        try {
            let image: Mat = (inputImage instanceof Uint8Array) ? (await imdecodeAsync(Buffer.from(inputImage))) : inputImage;
            
            image = await image.bgrToGrayAsync();

            const imageBrightness = await this.capture.GetBrightness(image);
            const targetBrightness = nconf.get("minimumBrightness");

            if (imageBrightness < targetBrightness)
                throw new ImageBelowBrightnessThresholdError(imageBrightness, targetBrightness);

            if (!skipDetection) {
                image = await this.capture.FaceFromImage(image);
            }

            image = await this.capture.PreprocessFace(image);

            const dbFace = await database.Face.create({
                name,
                autostart,
                image: (await imencodeAsync(nconf.get("imageFormat"), image))
            });

            const face = new Face(
                dbFace.id,
                dbFace.name,
                dbFace.image,
                dbFace.autostart
            );

            return face;
        }
        catch (error) {
            logger.error(`Error adding face: ${error.message}`);

            throw error;
        }
    }

    /**
     * Adds a face detected in the capture source to the database.
     * @param name - Friendly name of the face.
     * @param autostart - Whether the face should be loaded on application start. 
     */
    public async AddFaceFromCamera(name: string, autostart: boolean = false): Promise<Face> {
        const { logger } = this.resources;

        try {
            logger.verbose("Attempting to add a face from the capture source");
            const image = await this.capture.ImageFromCamera();
            return await this.AddFace(image, name, autostart, true);
        } catch (error) {
            logger.error(`Error adding face from the capture source: ${error.message}`);
            throw error;
        }   
    }

    /**
     * Retrieves a face from the database.
     * @param faceId - ID of the face to retrieve
     */
    public async GetFace(faceId: number): Promise<Face> {
        const { logger, database } = this.resources;
        try {
            let dbFace = await database.Face.findById(faceId);
            return await DatabaseModels.FromDBFace(dbFace);
        } catch (error) {
            logger.error(`Error retrieving face "${faceId}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieves all faces from the database.
     */
    public async GetFaces(): Promise<Face[]>{
        const { logger, database } = this.resources;
        try {
            let dbFaces = await database.Face.findAll();
            return await Promise.all<Face>(dbFaces.map(DatabaseModels.FromDBFace));
        } catch (error) {
            logger.error(`Error retrieving faces: ${error.message}`);
            throw error;
        }      
    }  

    /**
     * Removes a face from the database.
     * @param faceId - ID of the face to remove.
     */
    public async RemoveFace(faceId: number): Promise<void> {
        const { logger, database } = this.resources;
        try {
            await database.Face.destroy({
                where: {
                    id: faceId
                }
            });
        } catch (error) {
            logger.error(`Error removing face ${faceId}: ${error.message}`);
            throw error;
        }     
    }

    /**
     * Upates an existing face.
     * @param face - Object containing properties to update.
     * @param scanForFace - If true, will scan the `image` property for a face.
     * @param imageFromCamera - If true, will attempt to detect a face in the capture source.
     */
    public async UpdateFace(face: Face, scanForFace: boolean = false, imageFromCamera: boolean = false): Promise<Face> {
        const { logger, database, nconf } = this.resources;

        try {
            let newFace;
            if (imageFromCamera) {
                newFace = await this.capture.ImageFromCamera();
            } else {
                newFace = await imdecodeAsync(Buffer.from(face.image));
            }
            if (imageFromCamera || scanForFace) {   
                newFace = await this.capture.FaceFromImage(newFace);
            }

            newFace = await newFace.bgrToGrayAsync();
            newFace = await this.capture.PreprocessFace(newFace);

            face.image = await imencodeAsync(nconf.get("imageFormat"), newFace);

            await database.Face.update(face, { where: { id: face.id } });
            
            return face;
        } catch (error) {
            logger.error(`Error updating face: ${error.message}`);
            throw error;
        }     
    }
}