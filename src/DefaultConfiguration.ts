import * as opencv4nodejs from "opencv4nodejs";
/**
 * The environment variables that will be read into the application configuration. 
 */
export const env_whitelist: ReadonlyArray<string> = Object.freeze([
    "LOG_LEVEL",
    "DATABASE_URL",
    "CAPTURE_DEVICE_PORT",
    "PORT"
]);

/**
 * Default configuration for the application.
 */
export default {
    // The minimum log level required for messages to be written to the console. All winston log levels are valid, plus "silent" to disable logging.
    "logLevel": "info",
    // Url to the database. sqlite, postgrs, mysql and mssql are supported via "sequelize". Sqlite is used by default. 
    "databaseUrl": "sqlite://face-command.sqlite",
    // Default device capture port that will be passed to OpenCV.
    "captureDevicePort": 0,
    // All images added will be resized to these dimensions. 
    "imageSize": {
        "width": 100,
        "height": 100
    },
    // How frequently images should be taken and processed, in milliseconds. 
    "imageCaptureFrequency": 1000,
    // The file format images will be saved in before being exported to the database. 
    "imageFormat": ".png",
    // Options passed to the OpenCV EigenFaceRecognizer class.
    "eigenFaceRecognizerOptions": {
        "components": 10,
        "threshold": 123
    },
    // Indicates whether detection should stop if an error occurs. 
    "stopOnDetectionError": false,
    // Indicates whether detection should start when application has started.
    "autostartDetection": true,
    // Indicates whether to enable the HTTP server (and the WebSocket RPC Interface).
    "httpServer": true,
    // Indicates whether to display the web interface (face-command-web).
    "webInterface": true,
    // Options that will be passed to the websocket server.
    "webSocketServer": {
        // Maximum amount size of each WebSocket message, in bytes.
        "maxReceivedMessageSize": 20971520, // 20MB
        // Maximum amount size of each WebSocket frame, in bytes.
        "maxReceivedFrameSize": 20971520 // 20MB
    },
    // Default host the HTTP server will bind to.
    "host": "127.0.0.1",
    // Default port the HTTP server will bind to.
    "port": 7732,
    // Endpoint the websocket RPC server will listen on.
    "endpoint": "/rpc",
    // Additonal RPC transports for the RPC interface (e.g. TCP).
    "rpcTransports": [],
    // Command types that will be loaded.
    // Will require() any types listed below and will attempt to use the "default" export as the class. 
    "commandTypes": [
        `${__dirname}/CommandTypes/LockScreen`
    ],
    // The minimum brightness needed for detection to run.
    "minimumBrightness": 0.5,
    // Cascade classifier that will be used.
    "cascadeClassifier": "HAAR_FRONTALFACE_ALT2",
    // Cascade classifiers that are available.
    "cascadeClassifiers": [
        {
            key: "HAAR_FRONTALCATFACE",
            value: opencv4nodejs.HAAR_FRONTALCATFACE
        },
        {
            key: "HAAR_FRONTALCATFACE_EXTENDED",
            value: opencv4nodejs.HAAR_FRONTALCATFACE_EXTENDED
        },
        {
            key: "HAAR_FRONTALFACE_ALT",
            value: opencv4nodejs.HAAR_FRONTALFACE_ALT
        },
        {
            key: "HAAR_FRONTALFACE_ALT2",
            value: opencv4nodejs.HAAR_FRONTALFACE_ALT2
        },
        {
            key: "HAAR_FRONTALFACE_ALT_TREE",
            value: opencv4nodejs.HAAR_FRONTALFACE_ALT_TREE
        },
        {
            key: "HAAR_FRONTALFACE_DEFAULT",
            value: opencv4nodejs.HAAR_FRONTALFACE_DEFAULT
        }
    ]
};