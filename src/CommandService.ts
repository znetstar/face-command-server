import * as msgpack from "msgpack-lite";
import { RunConditionType, Status, Command, CommandServiceBase, CommandTypeBase, RunCondition, Face, FaceManagementServiceBase, StatusType, CommandOptions } from "face-command-common";
import AppResources from "./AppResources";
import DetectionService from "./DetectionService";
import DatabaseModels from "./DatabaseModels";
import { default as Constructible } from "face-command-common/lib/ConstructibleExternalResource";


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

    public GetCommandTypes(): Constructible<CommandTypeBase>[] {
        return this.resources.nconf.get("commandTypes")
            .map((type: string): Constructible<CommandTypeBase> => <Constructible<CommandTypeBase>>require(type).default);
    }

    public CommandTypeFromName(name: string): Constructible<CommandTypeBase> {
        const cmd = this.GetCommandTypes().filter((t: any) => t.name === name)[0];

        if (!cmd) 
            throw new NonExistantCommandException(name);
        
        return cmd;
    }

    public GetCommandTypeNames(): string[] {
        return this.GetCommandTypes().map((t: Constructible<CommandTypeBase>) => t.name);
    }

    public async RPC_AddCommand(commandTypeName: string, runConditions: any[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;

        return await this.AddCommand(commandTypeName, (await Promise.all(runConditions.map(async (runConditionRaw): Promise<RunCondition> => {
            let faces: Face[] = [];
            if (runConditionRaw.facesToRecognize) {
                faces = await Promise.all<Face>(runConditionRaw.facesToRecognize.map(async (faceId: number): Promise<Face> => {
                    const dbFace = await database.Face.findById(faceId);
                    return DatabaseModels.FromDBFace(dbFace);
                }));
            }
            
            return new RunCondition(runConditionRaw.runConditionType, faces);
        }))), name, data);
    }

    public async AddCommand(inputCommandType: string|Constructible<CommandTypeBase>, runConditions: RunCondition[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;
        
        const commandType = (typeof(inputCommandType) === 'string') ? this.CommandTypeFromName(inputCommandType) : inputCommandType;

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
        return await DatabaseModels.FromDBCommand((await this.resources.database.Command.findById(id)), this.resources);
    }

    public async GetCommands(): Promise<Command[]> {
        return await Promise.all(
            (await this.resources.database.Command.findAll())
                .map((dbCommand) => DatabaseModels.FromDBCommand(dbCommand, this.resources))
        );
    }

    public async UpdateCommand(commandDelta: Command): Promise<Command> {
        const { database } = this.resources;

        const dbCommand = await database.Command.findById(commandDelta.id);
        const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

        const dbCommandDelta: any = {
            id: command.id,
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

                if (runConditionDelta.facesToRecognize) {
                    for (const face of runConditionDelta.facesToRecognize) {
                        const dbFace = database.Face.findById(face.id);
                        await dbRunCondition.addFace(dbFace);
                    }
                }
            }
        }

        await database.Command.update(dbCommandDelta, { where: { id: dbCommandDelta.id } });
        return await DatabaseModels.FromDBCommand(dbCommand, this.resources);
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
        const { logger } = this.resources;
        try {
            const options = new CommandOptions(status, command.data);
            const commandType = typeof(command.type) === 'string' ? this.CommandTypeFromName(command.type) : command.type;
            const type = new commandType(this.resources);

            type.Run(options);

            logger.info(`Successfully ran command ${command.id}`);
        } catch (error) {
            logger.error(`Error running ${command.id}: ${error.message}`);
        }
    }

    public async OnStatusChange(status: Status): Promise<void> {
        const { database, logger } = this.resources;

        let conditionType: Array<number> = [];
        if (status.statusType === +StatusType.FacesDetected)
            conditionType.push(+RunConditionType.RunOnFaceDetected);
    
        else if (status.statusType === +StatusType.FacesNoLongerDetected)
            conditionType.push(+RunConditionType.RunOnFacesNoLongerDetected, +RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized);

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

        const ranCommand: any = {};

        for (const runCondition of runConditions) {
            if ((status.statusType === +StatusType.FacesRecognized || status.statusType === +StatusType.FacesNoLongerRecognized) && (runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesRecognized || runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesNoLongerRecognized)) {
                const faceMatch = Boolean(runCondition.facesToRecognize.filter((f1) => status.recognizedFaces.some((f2) => f1.id === f2.id)).length);
                if (!faceMatch) continue;
            }

            if (ranCommand[runCondition.commandId]) 
                continue;

            const dbCommand = await database.Command.findById(runCondition.commandId);
            const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

            ranCommand[command.id] = true;
            await this.RunCommand(command, status);
        }
    }
}