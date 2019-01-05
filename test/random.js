const Random = require("face-command-common/lib/Random").default;
const Chance = require("chance");
const Nconf = require("nconf");
const winston = require("winston");
const Sequelize = require("sequelize");
const { imdecodeAsync, CascadeClassifier, HAAR_FRONTALFACE_ALT2 } = require("opencv4nodejs");
const fs = require("fs").promises;
const temp = require("temp");
const path = require("path");
let { FaceCapture } = require("../lib");
const { AppResources, DatabaseModels, DetectionService, CommandService, ConfigService, LogsService, FaceManagementService } = require("../lib");
const { WinstonSilentLogger } = require("../lib/AppResources");
const { Server } = require("multi-rpc");

temp.track();

const chance = Chance();
const common = new Random();

function sampleCommandTypeName() {
    return "SampleCommandType";
}

function sampleCommandTypePath() {
    return path.join(__dirname, sampleCommandTypeName());
}

async function sampleImage() {
    return await fs.readFile(path.join( __dirname, "sample.png" ));
}

function captureSource() {
    return {
        readAsync: async function () {
            return await imdecodeAsync(await sampleImage());
        }
    };
}

async function capture() { 
    let oldFc = FaceCapture.prototype;

    FaceCapture = function (resources) {
        this.resources = resources;
        this.captureSource = captureSource();
        this.faceClassifier = new CascadeClassifier(HAAR_FRONTALFACE_ALT2);
    };

    FaceCapture.prototype = oldFc;

    const capture = new FaceCapture((await appResources()), 0);
    return capture;
}

async function detectionSvc (app) {
    app = app || await appResources();
    return new DetectionService(app, (await capture()));
}

async function commandSvc(app) {
    app = app || (await appResources())
    return new CommandService(app, (await detectionSvc(app)));
}

async function configSvc(app) {
    app = app || (await appResources())
    return new ConfigService(app);
}

async function logsSvc(app) {
    app = app || (await appResources())
    return new LogsService(app);
}

async function facesSvc(app, faceCapture) {
    app = app || (await appResources())
    return new FaceManagementService(app, (faceCapture || (await capture())));
}

async function appResources () {
    const nconf = new (Nconf.Provider)();
    nconf.use("memory");
    const info = await new Promise((resolve, reject) => {
        temp.open(".sqlite", (err, info) => {
            if (err) reject(err);
            else resolve(info);
        });
    });

    const db = new Sequelize(`sqlite://${info.path}`);
    await db.authenticate();
    const dbModels = new DatabaseModels(db);
    const rpcServer = new Server();
    return new AppResources(nconf, dbModels, WinstonSilentLogger, rpcServer);
}

module.exports = {
    chance,
    common,
    capture,
    detectionSvc,
    appResources,
    commandSvc,
    configSvc,
    logsSvc,
    facesSvc,
    sampleCommandTypePath,
    sampleCommandTypeName,
    sampleImage
};