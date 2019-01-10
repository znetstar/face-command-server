import * as msgpack from "msgpack-lite";
import { RunConditionType, Status, Command, CommandServiceBase, CommandTypeBase, RunCondition, Face, StatusType, CommandOptions } from "face-command-common";
import { default as Constructible } from "face-command-common/lib/ConstructibleExternalResource";
import AppResources from "./AppResources";
import DetectionService from "./DetectionService";
import DatabaseModels from "./DatabaseModels";
import { CommandExecutionError } from "./Errors";

/**
 * This error is thrown when the user references a command type that doesn't exist.
 */
export class NonExistantCommandTypeError extends Error {
    constructor(commandType: string) {
        super(`Command "${commandType}" does not exist`);
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
    constructor(commandId: number, runConditionType: RunConditionType) {
        super(`Command \"${commandId}\" already contains run condition \"${Number(runConditionType)}\"`);
    }
}

/**
 * This error is thrown when the user tries to retrieve a command that already exists.
 */
export class NonExistantCommandError extends Error {
    constructor(commandId: number) {
        super(`Command \"${commandId}\" does not exist.`);
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
            dbEntry.data = msgpack.encode(data);
        
        // Saves the command object to the database.
        const dbCommand = await database.Command.create(dbEntry);

        // Saves each run condition to the database.
        for (const condition of runConditions) {
            const dbCondition = await database.RunCondition.create({
                runConditionType: Number(condition.runConditionType)
            });
            
            await dbCommand.addRunCondition(dbCondition);
            condition.id = dbCondition.id;
            condition.commandId = dbCommand.id;
            
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
        const cmd = await this.resources.database.Command.findById(id);
        if (!cmd) 
            throw new NonExistantCommandError(id);

        return await DatabaseModels.FromDBCommand(cmd, this.resources);;
    }
    
    /**
     * Retrieves a command from the database, but ensures the type returned is a string.
     * @param id - ID of the command to retrieve.
     */
    public async RPC_GetCommand(id: number): Promise<Command> {
        const cmd = await this.GetCommand(id);
        if (typeof(cmd.type) === 'function')
            cmd.type = (<Function>cmd.type).name;
        
        return cmd;
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
     * Retrieves all commands from the database , but ensures the types returned are strings.
     */
    public async RPC_GetCommands(): Promise<Command[]> {
        const commands = await Promise.all(
            (await this.resources.database.Command.findAll())
                .map((dbCommand) => DatabaseModels.FromDBCommand(dbCommand, this.resources))
        );

        return commands.map((cmd): Command => {
            if (typeof(cmd.type) === 'function')
                cmd.type = (<Function>cmd.type).name;
        
            return cmd;       
        });
    }
    

    /**
     * Updates an existing command with inputted properties.
     * @param commandDelta - Properties to update the command with.
     */
    public async UpdateCommand(commandDelta: Command): Promise<Command> {
        const { database } = this.resources;

        const dbCommand = await database.Command.findById(commandDelta.id);

        if (!dbCommand) 
            throw new NonExistantCommandError(commandDelta.id);

        const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

        // Properties that will be sent to the database to replace the existing command.
        const dbCommandDelta: any = {
            id: command.id,
            name: commandDelta.name,
            type: (typeof(commandDelta.type) === 'function') ? (<Function>commandDelta.type).name : commandDelta.type
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

            logger.debug(`Running command "${command.name}"`);

            return await type.Run(options);
        } catch (innerError) {
            const error = new CommandExecutionError(innerError);
            logger.error(`Error executing command "${command.name}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Is called when a status change occurs.
     * @param status - The new status.
     * @param lastStatus - The status that occured immediately before it, if any.
     */
    public async OnStatusChange(status: Status, lastStatus: Status): Promise<void> {
        const { database, logger } = this.resources;

        // Adds run condition types to the database query for run conditions based on the type of status that was raised.
        let conditionType: Array<number> = [];
        if (status.statusType === +StatusType.FacesDetected)
            conditionType.push(+RunConditionType.RunOnFaceDetected);
    
        else if ((status.statusType === +StatusType.FacesNoLongerDetected) || (status.statusType === +StatusType.BrightnessTooLow))
            conditionType.push(+RunConditionType.RunOnFacesNoLongerDetected, +RunConditionType.RunOnSpecificFacesNoLongerRecognized, +RunConditionType.RunOnAnyFaceNoLongerRecognized);

        else if (status.statusType === +StatusType.FacesRecognized && (status.recognizedFaces))
            conditionType.push(+RunConditionType.RunOnFaceDetected, +RunConditionType.RunOnSpecificFacesRecognized, +RunConditionType.RunOnAnyFaceRecognized);

        else if (status.statusType === +StatusType.FacesRecognized)
            conditionType.push(+RunConditionType.RunOnFaceDetected, +RunConditionType.RunOnAnyFaceRecognized);

        else if (status.statusType === +StatusType.NoFacesDetected)
            conditionType.push(+RunConditionType.RunOnNoFacesDetected);

        const facesInNewStatus: number[] = [];
        const facesNotInNewStatus: number[] = [];

        if (lastStatus && lastStatus.statusType === +StatusType.FacesRecognized && lastStatus.recognizedFaces) {
            for (let face of lastStatus.recognizedFaces) {
                if (!status.recognizedFaces.filter((f) => f.id === face.id).length) {
                    facesNotInNewStatus.push(face.id);
                }
            }
        }

        if (status.statusType === +StatusType.FacesRecognized) {
            for (let face of status.recognizedFaces) {
                facesInNewStatus.push(face.id);
            }
        }

        if (facesNotInNewStatus) 
            conditionType.push(+RunConditionType.RunOnSpecificFacesNoLongerRecognized); 
        
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

            if (status.statusType === +StatusType.FacesRecognized && runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesRecognized) {
                const match = runCondition.facesToRecognize.map((f) => f.id).some((fId) => facesInNewStatus.some((i) => i === fId));
                if (!match) continue;
            }

            if (runCondition.runConditionType === +RunConditionType.RunOnSpecificFacesNoLongerRecognized) {
                const match = runCondition.facesToRecognize.map((f) => f.id).some((fId) => facesNotInNewStatus.some((i) => i === fId));
                if (!match) continue;
            }

            const dbCommand = await database.Command.findById(runCondition.commandId);
            if (dbCommand) {
                const command = await DatabaseModels.FromDBCommand(dbCommand, this.resources);

                ranCommand.add(runCondition.commandId);;
                await this.RunCommand(command, status);
                logger.info(`Successfully ran command "${command.name}"`)
            }
        }
    }
}