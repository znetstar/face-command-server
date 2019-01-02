import { MsgPackSerializer, WebSocketTransport } from "multi-rpc";
/**
 * The environment variables that will be read into the application configuration. 
 */
export const env_whitelist: ReadonlyArray<string> = Object.freeze([
    "LOG_LEVEL",
    "DATABASE_URL",
    "CAPTURE_DEVICE_PORT",
    "PORT"
]);

export default {
    "logLevel": "info",
    "quiet": false,
    "databaseUrl": "sqlite://face-command.sqlite",
    "captureDevicePort": 0,
    "imageSize": {
        "width": 100,
        "height": 100
    },
    "imageCaptureFrequency": 1000,
    "imageFormat": ".png",
    "eigenFaceRecognizerOptions": {
        "components": 10,
        "threshold": 123
    },
    "stopOnDetectionError": false,
    "targetBrightness": 0.8,
    "autostartDetection": true,
    "httpServer": true,
    "webInterface": true,
    "host": "127.0.0.1",
    "port": 7732,
    "endpoint": "/rpc",
    "rpcTransports": [],
    "commandTypes": [
        `${__dirname}/CommandTypes/LockScreen`
    ]
};