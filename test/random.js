const Promise = require("bluebird");
const Random = require("face-command-common/lib/Random").default;
const Chance = require("chance");
const Nconf = require("nconf");
const Sequelize = require("sequelize");
const { imdecodeAsync, CascadeClassifier, HAAR_FRONTALFACE_ALT2 } = require("opencv4nodejs");
const fs = require("fs").promises;
const temp = Promise.promisifyAll(require("temp"));
const path = require("path");
const { Server } = require("multi-rpc");
let { FaceCapture } = require("../lib");
const { AppResources, DatabaseModels, DetectionService, CommandService, ConfigService, LogsService, FaceManagementService } = require("../lib");
const { WinstonSilentLogger } = require("../lib/AppResources");


temp.track();

async function tempFile() {
    return await temp.openAsync.apply(temp, arguments);
}

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

async function capture(resources) { 
    let oldFc = FaceCapture.prototype;

    FaceCapture = function (resources) {
        this.resources = resources;
        this.captureSource = captureSource();
        this.faceClassifier = new CascadeClassifier(HAAR_FRONTALFACE_ALT2);
    };

    FaceCapture.prototype = oldFc;

    const capture = new FaceCapture(resources || (await appResources()), 0);
    return capture;
}

async function detectionSvc (app, cap) {
    app = app || await appResources();
    return new DetectionService(app, cap || (await capture()));
}

async function commandSvc(app, det) {
    app = app || (await appResources());
    return new CommandService(app, det || (await detectionSvc(app)));
}

async function commandSvcReplaceRun(app, fn) {
    const svc = await commandSvc(app);
    svc.RunCommand = fn.bind(svc);
    return svc;
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
    return new FaceManagementService(app, (faceCapture || (await capture(app))));
}


async function appResources (defaultConfig) {
    const nconf = new (Nconf.Provider)();

    if (!defaultConfig) {
        nconf.use("memory");

        defaultConfig = require("../lib/DefaultConfiguration").default;
        defaultConfig.commandTypes = [
            sampleCommandTypePath()
        ];

        defaultConfig.minimumBrightness = 0;
    }

    nconf.defaults(defaultConfig);

    const info = await new Promise((resolve, reject) => {
        temp.open(".sqlite", (err, info) => {
            if (err) reject(err);
            else resolve(info);
        });
    });

    const db = new Sequelize(`sqlite://${info.path}`);
    await db.authenticate();
    const dbModels = new DatabaseModels(db);
    await dbModels.create();
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
    commandSvcReplaceRun,
    configSvc,
    logsSvc,
    facesSvc,
    sampleCommandTypePath,
    sampleCommandTypeName,
    sampleImage,
    tempFile
};