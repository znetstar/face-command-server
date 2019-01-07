const { assert } = require("chai");
const { RunConditionType, StatusType, RunCondition} = require("face-command-common");
const random = require("./random");
const Sequelize = require("sequelize");
const { DatabaseModels } = require("..");

describe("DatabaseModels", function () {
    describe("FromDBRunCondition()", function () {
        it("should return a RunCondition object with the provided properties", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const faceSvc = await random.facesSvc(res, cap);
            
            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const dbFace = await res.database.Face.findById(face.id);

            const conditionType = +RunConditionType.RunOnSpecificFacesRecognized;
            
            const dbRunCondition = await res.database.RunCondition.create({
                runConditionType: conditionType
            });

            await dbRunCondition.addFace(dbFace);

            const match = {
                commandId: null,
                runConditionType: conditionType,
                facesToRecognize: [
                    face
                ],
                id: dbRunCondition.id
            };

            const result = await DatabaseModels.FromDBRunCondition(await res.database.RunCondition.findById(dbRunCondition.id));
            
            assert.deepEqual(match, result);
        });
    });

    describe("FromDBFace()", function () {
        it("should return a Face object with the provided properties", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const faceSvc = await random.facesSvc(res, cap);

            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const dbFace = await res.database.Face.findById(face.id);

            const result = await DatabaseModels.FromDBFace(dbFace);
            
            assert.deepEqual(face, result);
        });
    });

    describe("FromDBStatus()", function () {
        it("should return a Status object with the provided properties", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const faceSvc = await random.facesSvc(res, cap);
            const detSvc = await random.detectionSvc(res, cap);

            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const status = await detSvc.AddStatus(StatusType.FacesRecognized, new Date(), random.chance.floating({ min: 0, max: 1 }), [ face ]);

            const result = await DatabaseModels.FromDBStatus(await res.database.Status.findById(status.id));
            
            assert.deepEqual(status, result);
        });
    });

    describe("FromDBStatus()", function () {
        it("should return a Status object with the provided properties", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const faceSvc = await random.facesSvc(res, cap);
            const detSvc = await random.detectionSvc(res, cap);

            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const status = await detSvc.AddStatus(StatusType.FacesRecognized, new Date(), random.chance.floating({ min: 0, max: 1 }), [ face ]);

            const result = await DatabaseModels.FromDBStatus(await res.database.Status.findById(status.id));
            
            assert.deepEqual(status, result);
        });
    });

    describe("FromDBCommand()", function () {
        it("should return a Command object with the provided properties", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const faceSvc = await random.facesSvc(res, cap);
            const cmdSvc = await random.commandSvc(res);

            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const rc = new RunCondition(+RunConditionType.RunOnSpecificFacesRecognized, [ face ]);
            const cmd = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string(), random.chance.integer());
            
            const result = await DatabaseModels.FromDBCommand(await res.database.Command.findById(cmd.id), res);
            
            assert.deepEqual(cmd, result);
        });
    });

    describe("create()", function () {
        it("should create database models successfully", async function () {
            const info = await random.tempFile(".sqlite");
        
            const db = new Sequelize(`sqlite://${info.path}`);
            await db.authenticate();
            const dbModels = new DatabaseModels(db);
            await dbModels.create();
        });
    });
});