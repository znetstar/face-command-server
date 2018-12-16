import * as msgpack from "msgpack-lite";
import { RunConditionType, Status, Command, CommandServiceBase, CommandTypeBase, RunCondition, Face, FaceManagementServiceBase, StatusType } from "face-command-common";
import AppResources from "./AppResources";
import DetectionService from "./DetectionService";
import FaceManagementService from "./FaceManagementService";
import DatabaseModels from "./DatabaseModels";


export class NonExistantCommandException extends Error {
    constructor(commandName: string) {
        super(`Command "${commandName}" does not exist`);
    }
}

export class FacesRecognizedSetInInvalidRunCondition extends Error {
    constructor(runConditionType: RunConditionType) {
        super(`Run condition ${Number(runConditionType)} does not have \"FacesRecognized\" as a paramater`);
    }
}

export class RunConditionExistsException extends Error {
    constructor(commandId: Number, runConditionType: RunConditionType) {
        super(`Command \"${commandId}\" already contains run condition \"${Number(runConditionType)}\"`);
    }
}

export default class CommandService extends CommandServiceBase {
    constructor(protected resources: AppResources, protected detection: DetectionService) {
        super(resources);
        this.detection.on("StatusChange", this.OnStatusChange.bind(this));
    }

    public GetCommandTypes(): CommandTypeBase[] {
        return this.resources.nconf.get("commandTypes")
            .map((type: string) => <CommandTypeBase>require(type).default);
    }

    public CommandTypeFromName(name: String): CommandTypeBase {
        return this.GetCommandTypes()
            .filter((t: any) => t.name === name)[0];
    }

    public GetCommandTypeNames(): string[] {
        return this.GetCommandTypes().map((t: CommandTypeBase) => Object.getPrototypeOf(t).name);
    }

    public async RPC_AddCommand(commandType: string, runConditions: any[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;

        return await this.AddCommand(this.CommandTypeFromName(commandType), (await Promise.all(runConditions.map(async (runConditionRaw): Promise<RunCondition> => {
            const faces = await Promise.all<Face>(runConditionRaw.facesToRecognize.map(async (faceId: number): Promise<Face> => {
                const dbFace = await database.Face.findById(faceId);
                return DatabaseModels.FromDBFace(dbFace);
            }));

            return new RunCondition(runConditionRaw.runConditionType, faces);
        }))), name, data);
    }

    public async AddCommand(commandType: any, runConditions: RunCondition[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;

        const dbEntry = <any>{
            name: name,
            type: commandType.name
        };

        if (typeof(data) !== 'undefined')
            dbEntry.Data = msgpack.encode(data);
        
        const dbCommand = await database.Command.create(dbEntry);

        for (const condition of runConditions) {
            const dbCondition = await database.RunCondition.create({
                runConditionType: Number(condition.runConditionType)
            });
            
            await dbCommand.addRunCondition(dbCondition);
            condition.id = dbCondition.id;
            
            if (condition.facesToRecognize) {
                for (const face of condition.facesToRecognize) {
                    const dbFace = await database.Face.findById(face.id);
                    await dbCondition.addFace(dbFace.id);
                }
            } 
        }

        return new Command(dbCommand.id, name, commandType, runConditions, data);
    }

    public async GetCommand(id: number): Promise<Command> {
        return await DatabaseModels.FromDBCommand(id, this.resources);
    }

    public async GetCommands(): Promise<Command[]> {
        return await Promise.all(
            (await this.resources.database.Command.findAll())
                .map((dbCommand) => DatabaseModels.FromDBCommand(dbCommand.id, this.resources))
        );
    }

    public async UpdateCommand(commandDelta: Command): Promise<void> {
        const { database } = this.resources;

        const command = await this.GetCommand(commandDelta.id);
        const dbCommand = await database.Command.findById(commandDelta.id);

        const dbCommandDelta: any = {
            id: commandDelta.id,
            name: commandDelta.name,
            type: commandDelta.type
        };

        for (let index = 0; index < command.runConditions.length; index++) {
            const runCondition = command.runConditions[index];

            if (!commandDelta.runConditions.filter((runConditionDelta) => runCondition.id === runConditionDelta.id).length) {
                await database.RunCondition.destroy({
                    where: {
                        id: runCondition.id
                    }
                });
                
                command.runConditions.splice(index, 1);
            }
        }

        for (let index = 0; index < commandDelta.runConditions.length; index++) {
            const runConditionDelta = commandDelta.runConditions[index];

            if (!command.runConditions.filter((runCondition) => runCondition.id === runConditionDelta.id).length) {
                const dbRunCondition = await database.RunCondition.create({
                    id: runConditionDelta.id,
                    runConditionType: runConditionDelta.runConditionType
                });

                await dbCommand.addRunCondition(dbRunCondition);

                for (const face of runConditionDelta.facesToRecognize) {
                    const dbFace = database.Face.findById(face.id);
                    await dbRunCondition.addFace(dbFace);
                }
            }
        }

        await database.Command.update(dbCommandDelta);
    }

    public async RemoveCommand(id: number): Promise<void> {
        const { database } = this.resources;

        await database.Command.destroy({
            where: {
                id: id
            }
        });
    }

    public async RunCommand(command: Command, status: Status): Promise<any> {
        
    }

    public async OnStatusChange(status: Status): Promise<void> {
        const { database } = this.resources;

        let conditionType: Array<number> = [];

        if (status.statusType === +StatusType.FacesDetected)
            conditionType.push(+RunConditionType.RunOnFaceDetected);
    
        else if (status.statusType === +StatusType.FacesNoLongerDetected)
            conditionType.push(+RunConditionType.RunOnFacesNoLongerDetected);

        else if (status.statusType === +StatusType.FacesNoLongerRecognized)
            conditionType.push(+RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized);

        else if (status.statusType === +StatusType.FacesRecognized)
            conditionType.push(+RunConditionType.RunOnSpecificFacesRecognized, +RunConditionType.RunOnAnyFaceRecognized);

        else if (status.statusType === +StatusType.NoFacesDetected)
            conditionType.push(+RunConditionType.RunOnNoFacesDetected);

        const dbRunConditions = await database.RunCondition.findAll({
            where: {
                $or: conditionType.map((runConditionType): any => ({ runConditionType }))
            }
        });

        const runConditions = await Promise.all(dbRunConditions.map(DatabaseModels.FromDBRunCondition));

        for (const runCondition of runConditions) {
            
        }
    }
}