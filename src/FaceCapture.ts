import AppResources from "./AppResources";
import { flatten, sum } from "lodash";
import {
    CascadeClassifier,
    Rect,
    Mat,
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
 * Is thrown when a frame is captured that is too low for procesisng.
 */
export class ImageBelowBrightnessThresholdError extends Error {
    constructor(brightness: number, targetBrightness: number) {
        super(`Brightness level of image ${brightness} was below the minimum required for processing ${targetBrightness}`);
    }
}

/**
 * Is thrown when a non-existant classifier is specified
 */
export class ClassifierDoesNotExistError extends Error {
    constructor(classifier: string) {
        super(`Classifier "${classifier}" does not exist`);
    }
}

/**
 * Contains methods to retrieve and process images from the capture source.
 */
export default class FaceCapture {
    /**
     * OpenCV capture source
     */
    public captureSource: VideoCapture;

    /**
     * 
     * @param resources - Common application resources.
     * @param devicePort - Device port to pass to OpenCV.
     * @param classifierName - Cascade classifier passed to OpenCV.
     * 
     * @throws {ClassifierDoesNotExistError} if the classifier provided
     */
    constructor(protected resources: AppResources, devicePort: number, classifierName: string) {
        const { nconf } = resources;
        
        this.captureSource = new VideoCapture(devicePort);

        const classiferInfo = nconf.get("cascadeClassifiers").filter((c: any) => c.key === classifierName)[0];

        if (!classiferInfo) 
            throw new ClassifierDoesNotExistError(classifierName);

        this.faceClassifier = new CascadeClassifier(classiferInfo.value);
    }

    private faceClassifier: CascadeClassifier;

    /**
     * Extracts faces from a provided image. 
     * @param source - Image to extract from.
     * @returns - An array of grayscale images containing each face detected. 
     */
    public async FacesFromImage(source: Mat): Promise<Mat[]> {
        const { objects } = await this.faceClassifier.detectMultiScaleAsync(source, 1.1, 10);
        return objects.map((bounds: Rect) => source.getRegion(bounds));
    }

    /** 
     * Extracts a single face from an image.
     * @param source - Image to extract from.
     * @returns - A grayscale image containing the extracted face.
     * @throws {NoFacesDetectedError|TooManyFacesError} - If no faces or more than one face is detected.
     */
    public async FaceFromImage(source: Mat): Promise<Mat> {
        const faces = await this.FacesFromImage(source);
        if (faces.length < 1) {
            throw new NoFacesDetectedError();
        }
        else if (faces.length > 1) {
            throw new TooManyFacesError();
        }

        return faces[0];
    }

    /**
     * Resizes face. All trained/detected images must be the same size.
     * @param image - Face to resize.
     */
    public async ResizeFace(image: Mat): Promise<Mat> {
        const { nconf } = this.resources;

        return await image.resizeAsync(nconf.get("imageSize:width"), nconf.get("imageSize:height"), INTER_CUBIC);
    }
    
    /** 
     * Retrieves the brightness of a provided image.
     * Will return a number between 0 and 1.
     */
    public async GetBrightness(image: Mat): Promise<number> {
        const data = image.getDataAsArray();
        
        return (sum(flatten(data)))/(data.length * data[0].length)/255;
    }
    
    /**
     * Applies historgram equalization
     * @param image - Image to apply equalization to.
     */
    public async StabilizeContrast(image: Mat): Promise<Mat> {
        return await image.equalizeHistAsync();
    }

    /**
     * Operations that should be run each face image before adding it to the database.
     * 
     * @param image - The face image to preprocess.
     * 
     */
    public async PreprocessFace(image: Mat): Promise<Mat> {
        const { nconf } = this.resources;
        
        const brightness = await this.GetBrightness(image);
        const targetBrightness: number = nconf.get("minimumBrightness");
        if (brightness < targetBrightness) {
            throw new ImageBelowBrightnessThresholdError(brightness, targetBrightness);
        }

        // Resize face
        image = await this.ResizeFace(image);
        // Stablize contrast
        image = await this.StabilizeContrast(image);

        return image;
    }

    /**
     * Takes a frame from the capture source.
     */
    public async ImageFromCamera(): Promise<Mat> {
        return await this.captureSource.readAsync();
    }
}