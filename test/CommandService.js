const { assert } = require("chai");
const lodash = require("lodash");
const { imdecodeAsync } = require("opencv4nodejs");
const { CommandTypeBase, RunCondition, RunConditionType, StatusType } = require("face-command-common");
const random = require("./random");
const { NonExistantCommandTypeError, NonExistantCommandError, CommandExecutionError } = require("..");

describe("CommandService", function () {
    describe("#constructor()", function () {
        it("should create successfully", async function () {
            const cmd = await random.commandSvc();
            assert.ok(cmd);
        });
    });

    describe("#GetCommandTypes()", function () {
        it("should return an array of all available command types", async function () {
            const resources = await random.appResources();
            resources.nconf.set("commandTypes", [
                random.sampleCommandTypePath()
            ]);

            const cmd = await random.commandSvc(resources);
            const types = cmd.GetCommandTypes();

            assert.equal(types.length, 1);
            const Type = types[0];

            const type = new Type(resources);
            assert.instanceOf(type, CommandTypeBase);
        });
    });

    describe("#CommandTypeFromName()", function () {
        it("should retrieve a command type by its name", async function () {
            const resources = await random.appResources();
            resources.nconf.set("commandTypes", [
                random.sampleCommandTypePath()
            ]);

            const Type = require(random.sampleCommandTypePath()).default;

            const cmd = await random.commandSvc(resources);
            const resultType = cmd.CommandTypeFromName(random.sampleCommandTypeName());

            assert.equal(Type, resultType);
        });

        it("should throw NonExistantCommandTypeError if the command type referenced does not exist", async function () {
            const res = await random.appResources();

            const cmd = await random.commandSvc(res);
            const fn = () => cmd.CommandTypeFromName(random.chance.string());

            assert.throws(fn, NonExistantCommandTypeError);
        });
    });

    describe("#GetCommandTypeNames()", function () {
        it("should retrieve all command type names", async function () {
            const resources = await random.appResources();
            resources.nconf.set("commandTypes", [
                random.sampleCommandTypePath()
            ]);

            const cmd = await random.commandSvc(resources);
            const typeNames = cmd.GetCommandTypeNames();

            assert.includeMembers([ random.sampleCommandTypeName() ], typeNames);
        });
    });

    describe("#RPC_AddCommand()", function () {
        it("should convert the face ids in the run conditions before adding the command. All properties sent to the server should be present in the resulting command", async function () {
            const resources = await random.appResources();
            const { nconf } = resources;

            const faceSvc = await random.facesSvc(resources);
            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), false);

            let condition = new RunCondition(+RunConditionType.RunOnSpecificFacesRecognized, [ face ]);

            const svc = await random.commandSvc(resources);

            const command = random.common.command();
            command.type = random.sampleCommandTypeName();
            command.runConditions = [ condition ];

            const rpcCondition = lodash.cloneDeep(condition);
            rpcCondition.facesToRecognize = rpcCondition.facesToRecognize.map((f) => f.id);

            const resultCommand = await svc.RPC_AddCommand(command.type, [ rpcCondition ], command.name, command.data);

            assert.equal(command.name, resultCommand.name);
            assert.equal(command.type, resultCommand.type.name);
            assert.deepEqual(command.data, resultCommand.data);

            for (let i = 0; i < resultCommand.runConditions.length; i++) {
                const resultCondition =  resultCommand.runConditions[i];
                const condition = command.runConditions[i];

                assert.equal(condition.runConditionType, resultCondition.runConditionType);
                for (let fi = 0; fi < resultCondition.facesToRecognize.length; fi++) {
                    const resultFace = resultCondition.facesToRecognize[fi];
                    const face = condition.facesToRecognize[i];

                    assert.equal(face.autostart, resultFace.autostart);
                    assert.equal(face.name, resultFace.name);
                    
                    const processedFaceImage = await imdecodeAsync(face.image);
                    const resultFaceImage = await imdecodeAsync(Buffer.from(resultFace.image));
                    assert.deepEqual(processedFaceImage.getDataAsArray(), resultFaceImage.getDataAsArray());
                }
            }

        });
    });

    describe("#AddCommand()", function () {
        it("when creating a commnand all properties sent to the server should be present in the resulting command", async function () {
            const resources = await random.appResources();
            const { nconf } = resources;

            const faceSvc = await random.facesSvc(resources);
            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), false);

            let condition = new RunCondition(+RunConditionType.RunOnSpecificFacesRecognized, [ face ]);

            const svc = await random.commandSvc(resources);

            const command = random.common.command();
            command.type = random.sampleCommandTypeName();
            command.runConditions = [ condition ];

            const rpcCondition = lodash.cloneDeep(condition);
            rpcCondition.facesToRecognize = rpcCondition.facesToRecognize.map((f) => f.id);

            const resultCommand = await svc.RPC_AddCommand(command.type, [ rpcCondition ], command.name, command.data);

            assert.equal(command.name, resultCommand.name);
            assert.equal(command.type, resultCommand.type.name);
            assert.deepEqual(command.data, resultCommand.data);

            for (let i = 0; i < resultCommand.runConditions.length; i++) {
                const resultCondition =  resultCommand.runConditions[i];
                const condition = command.runConditions[i];

                assert.equal(condition.runConditionType, resultCondition.runConditionType);
                for (let fi = 0; fi < resultCondition.facesToRecognize.length; fi++) {
                    const resultFace = resultCondition.facesToRecognize[fi];
                    const face = condition.facesToRecognize[i];

                    assert.equal(face.autostart, resultFace.autostart);
                    assert.equal(face.name, resultFace.name);
                    
                    const processedFaceImage = await imdecodeAsync(face.image);
                    const resultFaceImage = await imdecodeAsync(Buffer.from(resultFace.image));
                    assert.deepEqual(processedFaceImage.getDataAsArray(), resultFaceImage.getDataAsArray());
                }
            }

        });
    });

    describe("#GetCommand()", function () {
        it("Should successfully retrieve a command from the database", async function () {
            const cmdSvc = await random.commandSvc();

            const rc = random.common.runCondition();

            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            
            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());
            
            const resultCommand = await cmdSvc.GetCommand(command.id);
            assert.deepEqual(command, resultCommand);
        });

        it("should throw NonExistantCommandError if the command referenced does not exist", async function () {
            const cmdSvc = await random.commandSvc();
            let fn =  () => {};

            try {
                await cmdSvc.GetCommand(random.chance.integer({ min: 0}));
            } catch (error) {
                fn = () => { throw error };
            } finally {
                assert.throws(fn, NonExistantCommandError);
            }
        });
    });

    describe("#RPC_GetCommand()", function () {
        it("Should successfully retrieve a command from the database, but the command type should be a string", async function () {
            const cmdSvc = await random.commandSvc();

            const rc = random.common.runCondition();

            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            
            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());
            
            const resultCommand = await cmdSvc.RPC_GetCommand(command.id);
            command.type = command.type.name;
            assert.deepEqual(command, resultCommand);
        });


        it("should throw NonExistantCommandError if the command referenced does not exist", async function () {
            const cmdSvc = await random.commandSvc();
            let fn =  () => {};

            try {
                await cmdSvc.RPC_GetCommand(random.chance.integer({ min: 0}));
            } catch (error) {
                fn = () => { throw error };
            } finally {
                assert.throws(fn, NonExistantCommandError);
            }
        });
    });

    describe("#GetCommands()", function () {
        it("should return all commands saved", async function () {
            it("Should successfully retrieve a command from the database, but the command type should be a string", async function () {
                const cmdSvc = await random.commandSvc();
    
                const commands = []

                for (let i = 0; i < random.chance.integer({ min: 0, max: 25 }); i++) {
                    const rc = random.common.runCondition();
        
                    delete rc.id;
                    delete rc.commandId;
                    rc.facesToRecognize = [];
                    rc.runConditionType = +RunConditionType.RunOnFaceDetected;
                    const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());
                    commands.push(command);
                }   
                
                const resultCommands = await cmdSvc.GetCommands();
                assert.deepEqual(resultCommands, commands);
            });
        });
    });

    describe("#RPC_GetCommands()", function () {
        it("should return all commands saved, but the command types should be strings", async function () {
            it("Should successfully retrieve a command from the database, but the command type should be a string", async function () {
                const cmdSvc = await random.commandSvc();
    
                const commands = []

                for (let i = 0; i < random.chance.integer({ min: 0, max: 25 }); i++) {
                    const rc = random.common.runCondition();
        
                    delete rc.id;
                    delete rc.commandId;
                    rc.facesToRecognize = [];
                    rc.runConditionType = +RunConditionType.RunOnFaceDetected;
                    const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());
                    command.type = command.type.name;
                    commands.push(command);
                }   
                
                const resultCommands = await cmdSvc.RPC_GetCommands();
                assert.deepEqual(resultCommands, commands);
            });
        });
    });

    describe("#UpdateCommand()", function () {
        it("should throw NonExistantCommandError if the command type referenced does not exist", async function () {
            const cmdSvc = await random.commandSvc();

            let fn = () => {};
            try {
                await cmdSvc.UpdateCommand(random.common.command());
            } catch (error) {
                fn = () => { throw error; }
            } finally {
                assert.throws(fn, NonExistantCommandError);
            }
        });

        it("should successfully update basic properties on the command", async function () {
            const cmdSvc = await random.commandSvc();

            const rc = random.common.runCondition();

            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());

            const cmdDelta = lodash.cloneDeep(command);
            cmdDelta.name = random.chance.string();

            await cmdSvc.UpdateCommand(cmdDelta);

            const resultCmd = await cmdSvc.GetCommand(cmdDelta.id);

            assert.deepEqual(cmdDelta, resultCmd);
        });

        it("should remove run conditions that aren't present on the delta object", async function () {
            const cmdSvc = await random.commandSvc();

            const rc1 = random.common.runCondition();
            rc1.runConditionType = +RunConditionType.RunOnFaceDetected;

            const rc2 = random.common.runCondition();
            rc2.runConditionType = +RunConditionType.RunOnFacesNoLongerDetected;

            [rc1, rc2].forEach((rc) => {
                delete rc.id;
                delete rc.commandId;
                rc.facesToRecognize = [];
            });

            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc1, rc2 ], random.chance.string());

            const cmdDelta = lodash.cloneDeep(command);
            const removedRc = cmdDelta.runConditions.splice(0,1);

            await cmdSvc.UpdateCommand(cmdDelta);

            const resultCmd = await cmdSvc.GetCommand(cmdDelta.id);
            const resultRcIds = resultCmd.runConditions.map((rc) => rc.id);

            assert.notIncludeOrderedMembers(resultRcIds, [ removedRc[0].id ]);
        });

        it("should add run conditions that aren't present on the command in the database", async function () {
            const cmdSvc = await random.commandSvc();

            const rc1 = random.common.runCondition();
            rc1.runConditionType = +RunConditionType.RunOnFaceDetected;

            const rc2 = random.common.runCondition();
            rc2.runConditionType = +RunConditionType.RunOnFacesNoLongerDetected;

            [rc1, rc2].forEach((rc) => {
                delete rc.id;
                delete rc.commandId;
                rc.facesToRecognize = [];
            });

            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc1 ], random.chance.string());

            const cmdDelta = lodash.cloneDeep(command);
            cmdDelta.runConditions.push(rc2);

            await cmdSvc.UpdateCommand(cmdDelta);

            const resultCmd = await cmdSvc.GetCommand(cmdDelta.id);
            const resultRcTypes = resultCmd.runConditions.map((rc) => rc.runConditionType);

            assert.includeMembers(resultRcTypes, [ rc2.runConditionType ]);
        });
    });

    describe("#RemoveCommand()", function () {
        it("should remove a command and related run conditions", async function () {
            const cmdSvc = await random.commandSvc();
            const rc = random.common.runCondition();

            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string());
            
            await cmdSvc.RemoveCommand(command.id);

            const dbCmd = await cmdSvc.resources.database.Command.findById(command.id);
            const dbRc = await cmdSvc.resources.database.Command.findById(command.runConditions[0].id);

            assert.isNull(dbCmd);
            assert.isNull(dbRc);
        });
    });

    describe("#RunCommand()", function () {
        it("should run a command successfully and return the data set in the commandOptions object", async function () {
            const cmdSvc = await random.commandSvc();
            const rc = random.common.runCondition();

            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            const data = random.chance.integer();
            const command = await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string(), data);
            
            const result = await cmdSvc.RunCommand(command, random.common.status());
            assert.equal(data, result);
        });

        it("should throw CommandExecutionError if the command throws an error", async function () {
            const cmdSvc = await random.commandSvc();
            const rc = random.common.runCondition();
    
            cmdSvc.resources.nconf.set("commandTypes", [
                require("path").join(__dirname, 'ErrorCommandType')
            ]);
            
            delete rc.id;
            delete rc.commandId;
            rc.facesToRecognize = [];
            rc.runConditionType = +RunConditionType.RunOnFaceDetected;
            const data = random.chance.integer();
            const command = await cmdSvc.AddCommand('ErrorCommandType', [ rc ], random.chance.string(), data);
            
            let fn = () => {};
            try {
                await cmdSvc.RunCommand(command, random.common.status());   
            } catch (err) {
                fn = () => { throw err; }
            } finally {
                assert.throws(fn, CommandExecutionError);
            }
        });
    });
    
    describe("⚡OnStatusChange", function () {
        const RUN_COMMAND_WAIT_TIME = 2000;
        it("should trigger commands with condition RunOnFaceDetected on status FacesDetected", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const rc = random.common.runCondition();

                    delete rc.id;
                    delete rc.commandId;
                    rc.facesToRecognize = [];
                    rc.runConditionType = +RunConditionType.RunOnFaceDetected;
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), [ rc ], random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesDetected;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnFacesNoLongerDetected, RunOnSpecificFacesNoLongerRecognized or RunOnAnyFaceNoLongerRecognized on status FacesNoLongerDetected", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const conditions = [];
                    const types = [+RunConditionType.RunOnFacesNoLongerDetected, +RunConditionType.RunOnAnyFaceNoLongerRecognized, +RunConditionType.RunOnSpecificFacesNoLongerRecognized];
                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;
                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesNoLongerDetected;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should only trigger commands with condition RunOnSpecificFacesNoLongerRecognized or RunOnSpecificFacesRecognized if the recognizedFaces array contains faces specified in the facesToRecognize property of the run condition ", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME * 3);
            (async () => {
                let timeout;

                function rcCmd() {
                    clearTimeout(timeout);
                    done("Command was run");
                }

                try {
                    const res = await random.appResources();
                    const capture = await random.capture(res);
                    const cmdSvc = await random.commandSvcReplaceRun(res, rcCmd);
                    const faceSvc = await random.facesSvc(res, capture);

                    const conditions = [];
                    const types = [+RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnSpecificFacesRecognized];
                    for (let type of types) {
                        const rc = random.common.runCondition();

                        const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);

                        delete rc.id;
                        delete rc.commandId;
                        rc.facesToRecognize = [
                            face
                        ];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }

                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesRecognized;
                    const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
                    status.recognizedFaces.push(face);

                    cmdSvc.OnStatusChange(status);

                    timeout = setTimeout(() => {
                        done();
                    }, RUN_COMMAND_WAIT_TIME);
                } catch (error) {
                    done(error);
                }
            })();
        });


        it("should trigger commands with condition RunOnFacesNoLongerDetected, RunOnSpecificFacesNoLongerRecognized or RunOnAnyFaceNoLongerRecognized on status BrightnessTooLow", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const conditions = [];
                    const types = [+RunConditionType.RunOnFacesNoLongerDetected, +RunConditionType.RunOnAnyFaceNoLongerRecognized, +RunConditionType.RunOnSpecificFacesNoLongerRecognized];
                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;
                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.BrightnessTooLow;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnSpecificFacesNoLongerRecognized or RunOnAnyFaceNoLongerRecognized on status FacesNoLongerRecognized", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const conditions = [];
                    const types = [+RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized];
                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;
                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesNoLongerRecognized;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnFaceDetected or RunOnAnyFaceRecognized on status FacesRecognized", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const conditions = [];
                    const types = [+RunConditionType.RunOnFaceDetected, +RunConditionType.RunOnAnyFaceRecognized];
                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;
                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesRecognized;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnFaceDetected, RunOnSpecificFacesRecognized or RunOnAnyFaceRecognized on status FacesRecognized if recognizedFaces property is truthy", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const res = await random.appResources();
                    const cmdSvc = await random.commandSvcReplaceRun(res, rcCmd);
                    const faceSvc = await random.facesSvc(res, (await random.capture(res)))
                    const faces = [];

                    const conditions = [];

                    const rc1 = random.common.runCondition();

                    delete rc1.id;
                    delete rc1.commandId;

                    const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), false);
                    faces.push(face);
                    rc1.facesToRecognize = [ face ];

                    rc1.runConditionType = +RunConditionType.RunOnSpecificFacesRecognized;

                    conditions.push(rc1);

                    let types = [ +RunConditionType.RunOnAnyFaceRecognized, +RunConditionType.RunOnFaceDetected ];

                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;

                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }

                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesRecognized;
                    status.recognizedFaces = faces;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnFaceDetected or RunOnAnyFaceRecognized on status FacesRecognized if recognizedFaces property is truthy", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const res = await random.appResources();
                    const cmdSvc = await random.commandSvcReplaceRun(res, rcCmd);
                    const faces = [];

                    const conditions = [];

                    let types = [ +RunConditionType.RunOnFaceDetected, +RunConditionType.RunOnAnyFaceRecognized ];

                    for (let type of types) {
                        const rc = random.common.runCondition();

                        delete rc.id;
                        delete rc.commandId;

                        rc.facesToRecognize = [];
                        rc.runConditionType = type;
                        conditions.push(rc);
                    }

                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.FacesRecognized;
                    status.recognizedFaces = faces;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("should trigger commands with condition RunOnNoFacesDetected on status NoFacesDetected", function (done) {         
            this.timeout(RUN_COMMAND_WAIT_TIME);
            (async () => {
                function rcCmd() {
                    done();
                }

                try {
                    const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
                    
                    const conditions = [];
                    const rc = random.common.runCondition();

                    delete rc.id;
                    delete rc.commandId;
                    rc.facesToRecognize = [];
                    rc.runConditionType = +RunConditionType.RunOnNoFacesDetected;
                    conditions.push(rc);
                    
                    const data = random.chance.integer();
                    await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
                    const status = random.common.status();

                    status.statusType = +StatusType.NoFacesDetected;

                    cmdSvc.OnStatusChange(status);
                } catch (error) {
                    done(error);
                }
            })();
        });

        it("shouldn't run a command more than once if the status type matches more than one of its run conditions", async function () {
            this.timeout(RUN_COMMAND_WAIT_TIME);

            let timesRun = 0;
            function rcCmd() {
                timesRun++;
            }

            const cmdSvc = await random.commandSvcReplaceRun(void(0), rcCmd);
            
            const conditions = [];
            const types = [ +RunConditionType.RunOnFaceDetected, +RunConditionType.RunOnAnyFaceRecognized ];

            for (let type of types) {
                const rc = random.common.runCondition();
                delete rc.id;
                delete rc.commandId;
                rc.facesToRecognize = [];
                rc.runConditionType = type;
                conditions.push(rc);
            }
            
            const data = random.chance.integer();
            await cmdSvc.AddCommand(random.sampleCommandTypeName(), conditions, random.chance.string(), data);
            const status = random.common.status();

            status.statusType = +StatusType.FacesRecognized;

            await cmdSvc.OnStatusChange(status);

            assert.equal(1, timesRun);
        });
    });
}); 