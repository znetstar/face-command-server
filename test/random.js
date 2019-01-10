const Promise = require("bluebird");
const { EigenFaceRecognizerOptions } = require("face-command-common");
const Random = require("face-command-common/lib/Random").default;
const Chance = require("chance");
const Nconf = require("nconf");
const _ = require("lodash");
const Sequelize = require("sequelize");
const { imdecodeAsync, CascadeClassifier, HAAR_FRONTALFACE_ALT2 } = require("opencv4nodejs");
const fs = require("fs").promises;
const temp = Promise.promisifyAll(require("temp"));
const path = require("path");
const { Server } = require("multi-rpc");
let { FaceCapture } = require("../lib");
const { AppResources, DatabaseModels, DetectionService, CommandService, ConfigService, LogsService, FaceManagementService } = require("../lib");
const { WinstonSilentLogger } = require("../lib/AppResources");
const defaultConfig = require("../lib/DefaultConfiguration").default;
Object.freeze(defaultConfig);

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

function captureSource(image) {
    return {
        readAsync: async function () {
            return await imdecodeAsync(image || (await sampleImage()));
        }
    };
}

async function capture(resources, image) { 
    let oldFc = FaceCapture.prototype;

    FaceCapture = function (resources, image) {
        this.resources = resources;
        this.captureSource = captureSource(image);
        this.faceClassifier = new CascadeClassifier(HAAR_FRONTALFACE_ALT2);
    };

    FaceCapture.prototype = oldFc;

    const capture = new FaceCapture(resources || (await appResources()), image);
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


async function appResources (dConf) {
    const nconf = new (Nconf.Provider)();

    if (!dConf) {
        dConf = _.cloneDeep(defaultConfig);
        nconf.use("memory");

        dConf.commandTypes = [
            sampleCommandTypePath()
        ];

        dConf.minimumBrightness = 0;
    }

    nconf.defaults(dConf);

    const info = await temp.openAsync("sqlite");

    const db = new Sequelize(`sqlite://${info.path}`);
    await db.authenticate();
    const dbModels = new DatabaseModels(db);
    await dbModels.create();
    const rpcServer = new Server();
    return new AppResources(nconf, dbModels, WinstonSilentLogger, rpcServer);
}

function recOptions() {
    return new EigenFaceRecognizerOptions(defaultConfig.eigenFaceRecognizerOptions.components, defaultConfig.eigenFaceRecognizerOptions.threshold);
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
    tempFile,
    recOptions,
    defaultConfig
};