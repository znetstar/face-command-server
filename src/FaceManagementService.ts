import { FaceManagementServiceBase, Face } from "face-command-common";
import {
    imdecodeAsync,
    Mat,
    imencodeAsync,
} from "opencv4nodejs";
import AppResources from "./AppResources";
import FaceCapture from "./FaceCapture";
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


    public async AddFace(inputImage: Uint8Array|Mat, name: string, autostart: boolean = false, skipDetection: boolean = false): Promise<Face> {
        const { database, logger, nconf } = this.resources;
        try {
            let image: Mat = (inputImage instanceof Uint8Array) ? (await imdecodeAsync(Buffer.from(inputImage))) : inputImage;
            
            image = await image.bgrToGrayAsync();

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

    public async AddFaceFromCamera(name: string, autostart: boolean = false): Promise<Face> {
        const { logger, nconf } = this.resources;
        const { ImageFromCamera } = this.capture;

        try {
            logger.verbose("Attempting to add a face from the capture source");
            const image = await this.capture.ImageFromCamera();
            return await this.AddFace(image, name, autostart, true);
        } catch (error) {
            logger.error(`Error adding face from the capture source: ${error.message}`);
            throw error;
        }   
    }

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

            await database.Face.update(face);
            
            return face;
        } catch (error) {
            logger.error(`Error updating face: ${error.message}`);
            throw error;
        }     
    }
}