
import * as Sequelize from "sequelize";
import { Face, Command, Status, RunCondition } from "face-command-common";
import { INTEGER, STRING, BLOB, BOOLEAN, SMALLINT, DATE, FLOAT, Sequelize as ISequelize } from "sequelize";
import * as msgpack from "msgpack-lite";
import * as moment from "moment";
import { default as AppResources } from "./AppResources";
import { default as CommandService } from "./CommandService";

/**
 * Contains database models and functions for processing objects saved in the database.
 */
export default class DatabaseModels {
    /**
     * Model for the Faces table.
     */
    public Face: Sequelize.Model<any, any>;

    /**
     * Model for the Statuses table.
     */
    public Status: Sequelize.Model<any, any>;

    /**
     * Model for the Commands table.
     */
    public Command: Sequelize.Model<any, any>;

    /**
     * Model for the RunConditions table.
     */
    public RunCondition: Sequelize.Model<any, any>;

    /**
     * 
     * @param sequelize - Instance of Sequelize.
     */
    constructor(private sequelize: ISequelize) {
        
    }

    /**
     * Format for the SQLite date string.
     */
    public static get SQLiteDateFormat(): string { return 'YYYY-MM-DD HH:mm:ss.SSS'; }

    /**
     * Converts a date to the SQLite date string.
     * @param date - Date to convert.
     */
    public static DateToSQLiteFormat(date: Date): string {
        return moment(date).format(DatabaseModels.SQLiteDateFormat);
    }

    /**
     * Converts a record in the RunConditions table into a RunCondition object.
     * @param dbRunCondition - Object containing columns/values from the database.
     */
    public static async FromDBRunCondition(dbRunCondition: any): Promise<RunCondition> {
        const dbFaces = await dbRunCondition.getFaces();
        const runCondition = new RunCondition(dbRunCondition.runConditionType, (await Promise.all<Face>(dbFaces.map(DatabaseModels.FromDBFace))), dbRunCondition.id);
        runCondition.commandId = dbRunCondition.commandId;
        return runCondition;
    }

    /**
     * Converts a record in the Faces table into a Face object.
     * @param dbFace - Object containing columns/values from the database.
     */
    public static async FromDBFace(dbFace: any): Promise<Face> {
        return new Face(dbFace.id, dbFace.name, new Uint8Array(dbFace.image), dbFace.autostart)
    }

    /**
     * Converts a record in the Statuses table into a Status object.
     * @param dbStatus - Object containing columns/values from the database.
     */
    public static async FromDBStatus(dbStatus: any): Promise<Status> {
        const dbFaces = await dbStatus.getFaces();
        return new Status(dbStatus.id, dbStatus.statusType, new Date(dbStatus.time), dbStatus.brightness, (await Promise.all<Face>(dbFaces.map(DatabaseModels.FromDBFace))));
    }

    /**
     * Converts a record in the Commands table into a Command object.
     * @param dbCommand - Object containing columns/values from the database.
     */
    public static async FromDBCommand(dbCommand: any, resources: AppResources): Promise<Command> {
        const dbConditions = await dbCommand.getRunConditions();
        const conditions = await Promise.all<RunCondition>(dbConditions.map(DatabaseModels.FromDBRunCondition));
        const commandType = CommandService.prototype.CommandTypeFromName.call({ 
            GetCommandTypes: CommandService.prototype.GetCommandTypes.bind({ resources })
        }, dbCommand.type);
        
        let data: any;

        if (dbCommand.data) {
            data = msgpack.decode(dbCommand.data);
        }
        
        return new Command(dbCommand.id, dbCommand.name, commandType, conditions, data);
    }   

    /**
     * Creates database tables if they do not already exist.
     */
    public async create(): Promise<any> {
        this.Face = this.sequelize.define("Face", {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: STRING, unique: true },
            image: { type: BLOB },
            autostart: { type: BOOLEAN, defaultValue: false }
        });
    
        this.Status = this.sequelize.define("Status", {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            statusType: { type: SMALLINT },
            time: { type: DATE },
            brightness: { type: FLOAT }
        });
    
        this.Command = this.sequelize.define("Command", {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: STRING,  unique: true },
            type: { type: STRING },
            data: { type: BLOB }
        });
    
        this.RunCondition = this.sequelize.define("RunCondition", {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            runConditionType: { type: SMALLINT }
        });
    
        const RunConditionFacesRecognized = this.sequelize.define('RunCondition_Face', {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            faceId: { type: INTEGER },
            runConditionId: { type: INTEGER }
        });

        const StatusFacesRecognized = this.sequelize.define('Status_Face', {
            id: { type: INTEGER, primaryKey: true, autoIncrement: true },
            faceId: { type: INTEGER },
            statusId: { type: INTEGER }
        });

        this.Command.hasMany(this.RunCondition, { foreignKey: 'commandId' });
        this.RunCondition.belongsToMany(this.Face, { through: "RunCondition_Face", foreignKey: 'runConditionId', otherKey: 'faceId' });
        this.Status.belongsToMany(this.Face, { through: "Status_Face", foreignKey: 'statusId', otherKey: 'faceId' });
        
        await RunConditionFacesRecognized.sync();
        await StatusFacesRecognized.sync();
        await this.Face.sync();
        await this.Status.sync();
        await this.Command.sync();
        await this.RunCondition.sync();
    }
}