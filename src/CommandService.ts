import * as msgpack from "msgpack-lite";
import { RunConditionType, Status, Command, CommandServiceBase, CommandTypeBase, RunCondition, Face, StatusType, CommandOptions } from "face-command-common";
import { default as Constructible } from "face-command-common/lib/ConstructibleExternalResource";
import AppResources from "./AppResources";
import DetectionService from "./DetectionService";
import DatabaseModels from "./DatabaseModels";

/**
 * This error is thrown when the user references a command type that doesn't exist.
 */
export class NonExistantCommandTypeError extends Error {
    constructor(commandName: string) {
        super(`Command "${commandName}" does not exist`);
    }
}

/**
 * This error is thrown when a RunCondition with a type other than 2 or 6 has the FacesRecognized field set.
 */
export class FacesRecognizedSetInInvalidRunConditionError extends Error {
    constructor(runConditionType: RunConditionType) {
        super(`Run condition ${Number(runConditionType)} does not have \"FacesRecognized\" as a paramater`);
    }
}

/**
 * This error is thrown when the user attempts to add a RunCondition that already exists to a command.
 */
export class RunConditionExistsError extends Error {
    constructor(commandId: Number, runConditionType: RunConditionType) {
        super(`Command \"${commandId}\" already contains run condition \"${Number(runConditionType)}\"`);
    }
}

/**
 * A service that runs commands based on changes in the detection status.
 */
export default class CommandService extends CommandServiceBase {
    /**
     * 
     * @param resources - Common application resources.
     * @param detection - Detection service to monitor for changes.
     */
    constructor(protected resources: AppResources, protected detection: DetectionService) {
        super(resources);
        this.detection.on("StatusChange", this.OnStatusChange.bind(this));
    }

    /**
     * Retrieves all of the command types available.
     * Paths to the command type should be added to the "commandTypes" config property.
     */
    public GetCommandTypes(): Constructible<CommandTypeBase>[] {
        return this.resources.nconf.get("commandTypes")
            .map((type: string): Constructible<CommandTypeBase> => <Constructible<CommandTypeBase>>require(type).default);
    }

    /**
     * Retrieves a `CommandType` based on the its class-name.
     * @param name - Class name of the command type to retrieve.
     */
    public CommandTypeFromName(name: string): Constructible<CommandTypeBase> {
        const cmd = this.GetCommandTypes().filter((t: any) => t.name === name)[0];

        if (!cmd) 
            throw new NonExistantCommandTypeError(name);
        
        return cmd;
    }

    /**
     * Retrieves the class name of all available command types.
     */
    public GetCommandTypeNames(): string[] {
        return this.GetCommandTypes().map((t: Constructible<CommandTypeBase>) => t.name);
    }

    /**
     * Is equivalent to `CommandService.AddCommand` execpt the elements in the `facesToRecognize` property of elements in the `runConditions` argument are face IDs instead of `Face` objects.
     * @param commandTypeName - Class name of the command type.
     * @param runConditions - Array of conditions that need to be met for the command to run
     * @param name - Friendly name for the command.
     * @param data - Arbitrary data to accompany the command. 
     */
    public async RPC_AddCommand(commandTypeName: string, runConditions: any[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;

        return await this.AddCommand(commandTypeName, (await Promise.all(runConditions.map(async (runConditionRaw): Promise<RunCondition> => {
            let faces: Face[] = [];
            if (runConditionRaw.facesToRecognize) {
                // This matches each the provided face ID with the face object from the database.
                faces = await Promise.all<Face>(runConditionRaw.facesToRecognize.map(async (faceId: number): Promise<Face> => {
                    const dbFace = await database.Face.findById(faceId);
                    return DatabaseModels.FromDBFace(dbFace);
                }));
            }
            
            return new RunCondition(runConditionRaw.runConditionType, faces);
        }))), name, data);
    }

    /**
     * Adds a command that will run when conditions are met to the database.
     * @param inputCommandType - Either the command type class constructor or the name of the class. 
     * @param runConditions - Conditions needed for the command to run.
     * @param name - Friendly name of the command.
     * @param data - Arbitrary data to accompany the command.  
     */
    public async AddCommand(inputCommandType: string|Constructible<CommandTypeBase>, runConditions: RunCondition[], name: string, data?: any): Promise<Command> {
        const { database } = this.resources;
        
        const commandType = (typeof(inputCommandType) === 'string') ? this.CommandTypeFromName(inputCommandType) : inputCommandType;

        const dbEntry = <any>{
            name: name,
            type: commandType.name
        };

        if (typeof(data) !== 'undefined')
            dbEntry.Data = msgpack.encode(data);
        
        // Saves the command object to the database.
        const dbCommand = await database.Command.create(dbEntry);

        // Saves each run condition to the database.
        for (const condition of runConditions) {
            const dbCondition = await database.RunCondition.create({
                runConditionType: Number(condition.runConditionType)
            });
            
            await dbCommand.addRunCondition(dbCondition);
            condition.id = dbCondition.id;
            
            // Creates the relation between the faces assigned to the run condition and the run condition.
            if (condition.facesToRecognize) {
                for (const face of condition.facesToRecognize) {
                    const dbFace = await database.Face.findById(face.id);
                    await dbCondition.addFace(dbFace);
                }
            } 
        }

        return new Command(dbCommand.id, name, commandType, runConditions, data);
    }

    /**
     * Retrieves a command from the database by its ID.
     * @param id - ID of the command to retrieve.
     */
    public async GetCommand(id: number): Promise<Command> {
        return await DatabaseModels.FromDBCommand((await this.resources.database.Command.findById(id)), this.resources);
    }

    /**
     * Retrieves all commands from the database.
     */
    public async GetCommands(): Promise<Command[]> {
        return await Promise.all(
            (await this.resources.database.Command.findAll())
                .map((dbCommand) => DatabaseModels.FromDBCommand(dbCommand, this.resources))
        );
    }

    /**
     * Updates an existing command with inputted properties.
     * @param commandDelta - Properties to update the command with.
     */
    public async UpdateCommand(commandDelta: Command): Promise<Command> {
        const { database } = this.resources;

        const dbCommand = await database.Command.findById(commandDelta.id);
        const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

        // Properties that will be sent to the database to replace the existing command.
        const dbCommandDelta: any = {
            id: command.id,
            name: commandDelta.name,
            type: commandDelta.type
        };

        // Compares the run conditions of the `commandDelta` object with the existing runConditions, removing run existing run conditions if needed.
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

        // Compares the run conditions of the `commandDelta` object with the existing runConditions, adding run existing run conditions if needed.
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

    /**
     * Removes a command from the database by its ID.
     * @param id - ID of the command to remove
     */
    public async RemoveCommand(id: number): Promise<void> {
        const { database } = this.resources;

        await database.Command.destroy({
            where: {
                id: id
            }
        });
    }

    /**
     * Executes a command.
     * @param command - Command to execute.
     * @param status - Status that caused the command to be executed.
     */
    public async RunCommand(command: Command, status: Status): Promise<any> {
        const { logger } = this.resources;
        try {
            const options = new CommandOptions(status, command.data);
            const commandType = typeof(command.type) === 'string' ? this.CommandTypeFromName(command.type) : command.type;
            const type = new commandType(this.resources);

            type.Run(options);

            logger.info(`Successfully ran command "${command.name}"`);
        } catch (error) {
            logger.error(`Error running ${command.id}: ${error.message}`);
        }
    }

    /**
     * Is called when a status change occurs.
     * @param status - The new status.
     */
    public async OnStatusChange(status: Status): Promise<void> {
        const { database, logger } = this.resources;

        // Adds run condition types to the database query for run conditions based on the type of status that was raised.
        let conditionType: Array<number> = [];
        if (status.statusType === +StatusType.FacesDetected)
            conditionType.push(+RunConditionType.RunOnFaceDetected);
    
        else if ((status.statusType === +StatusType.FacesNoLongerDetected) || (status.statusType === +StatusType.BrightnessTooLow))
            conditionType.push(+RunConditionType.RunOnFacesNoLongerDetected, +RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized);

        else if (status.statusType === +StatusType.FacesNoLongerRecognized)
            conditionType.push(+RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized);

        else if (status.statusType === +StatusType.FacesRecognized)
            conditionType.push(+RunConditionType.RunOnAnyFaceNoLongerRecognized, +RunConditionType.RunOnAnyFaceRecognized);

        else if (status.statusType === +StatusType.NoFacesDetected)
            conditionType.push(+RunConditionType.RunOnNoFacesDetected);

        const dbRunConditions = await database.RunCondition.findAll({
            where: {
                $or: conditionType.map((runConditionType): any => ({ runConditionType }))
            }
        });

        const runConditions = await Promise.all(dbRunConditions.map(DatabaseModels.FromDBRunCondition));

        const ranCommand = new Set<number>();
        // Loops through each matched run condition and runs the associated command.
        for (const runCondition of runConditions) {
            if (ranCommand.has(runCondition.commandId)) 
                continue;

            if ((status.statusType === +StatusType.FacesRecognized || status.statusType === +StatusType.FacesNoLongerRecognized) && (runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesRecognized || runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesNoLongerRecognized)) {
                const faceMatch = Boolean(runCondition.facesToRecognize.filter((f1) => status.recognizedFaces.some((f2) => f1.id === f2.id)).length);
                if (!faceMatch) continue;
            }

            const dbCommand = await database.Command.findById(runCondition.commandId);
            if (dbCommand) {
                const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

                ranCommand.add(runCondition.commandId);
                logger.debug(`Running command "${command.name}", type: ${command.type}`);
                await this.RunCommand(command, status);
            }
        }
    }
}