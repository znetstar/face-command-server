/**
 * The environment variables that will be read into the application configuration. 
 */
export const env_whitelist: ReadonlyArray<string> = Object.freeze([
    "LOG_LEVEL",
    "DATABASE_URL",
    "CAPTURE_DEVICE_PORT"
]);

export default Object.freeze({
    "logLevel": "info",
    "quiet":  false,
    "databaseUrl": "sqlite://face-command.sqlite",
    "captureDevicePort": 0,
    "imageSize": {
        "width": 100,
        "height": 100
    },
    "imageCaptureFrequency": 1000,
    "eigenFaceRecognizerOptions": {
        "components": -1,
        "threshold": -1
    }
});