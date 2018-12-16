import AppResources from "./AppResources";
import {
    CascadeClassifier,
    HAAR_FRONTALFACE_ALT2,
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

export default class FaceCapture {
    constructor(protected resources: AppResources) {

    }

    private faceClassifier: CascadeClassifier = new CascadeClassifier(HAAR_FRONTALFACE_ALT2);

    /**
     * Extracts faces from a provided image. 
     * @param source - Image to extract from.
     * @returns - An array of grayscale images containing each face detected. 
     */
    public async FacesFromImage(source: Mat): Promise<Mat[]> {
        const grayImage = await source.bgrToGrayAsync();

        const { objects } = await this.faceClassifier.detectMultiScaleAsync(grayImage, 1.1, 10);
        return objects.map((bounds: Rect) => grayImage.getRegion(bounds));
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
     * Operations that should be run each face image before adding it to the database.
     * 
     * @param image - The face image to preprocess.
     * @returns - The preprocessed image.
     */
    public async PreprocessFace(image: Mat): Promise<Mat> {
        // Resize face
        let mat = this.ResizeFace(image);

        return mat;
    }

    /**
     * Takes a frame from the capture source.
     * @param devicePort - Which device to capture from.
     * @returns - A single image from the capture source.
     */
    public async ImageFromCamera(devicePort: number): Promise<Mat> {
        const captureSource = new VideoCapture(devicePort);
        return await captureSource.readAsync();
    }
}