const { assert } = require("chai");
const path = require("path");
const { CommandTypeBase, RunCondition, Command, RunConditionType } = require("face-command-common");
const random = require("./random");

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
        it("should convert the face ids in the run conditions before adding the command", async function () {
            const resources = await random.appResources();
            resources.nconf.set("commandTypes", [
                random.sampleCommandTypePath()
            ]);

            const faceSvc = await random.facesSvc(resources);
            const face = await faceSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), false);

            let condition = new RunCondition(+RunConditionType.RunOnSpecificFacesRecognized, [ face ]);

            const svc = await random.commandSvc(resources);
            const resultCommand = await svc.RPC_AddCommand(command.type, [ condition ], command.name, command.data);
            
            assert.deepEqual(command, resultCommand);
        });
    });

    describe("⚡OnStatusChange", function () {

    });
}); 