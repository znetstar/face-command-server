
import * as Sequelize from "sequelize";
import { INTEGER, STRING, BLOB, BOOLEAN, SMALLINT, TIME, Sequelize as ISequelize } from "sequelize";

export default class DatabaseModels {
    private face: Sequelize.Model<any, any>;
    private status: Sequelize.Model<any, any>;
    private command: Sequelize.Model<any, any>;
    private runCondition: Sequelize.Model<any, any>;

    public get Face(): Sequelize.Model<any, any> { return this.face; }
    public get Status(): Sequelize.Model<any, any> { return this.status; }
    public get Command(): Sequelize.Model<any, any> { return this.command; }
    public get RunCondition(): Sequelize.Model<any, any> { return this.runCondition; }
    public get Sequelize(): ISequelize { return this.sequelize; }

    constructor(private sequelize: ISequelize) {
        
    }

    public async create(): Promise<any> {
        this.face = this.sequelize.define("Face", {
            ID: { type: INTEGER, primaryKey: true, autoIncrement: true },
            Name: { type: STRING, unique: true },
            Image: { type: BLOB },
            autostart: { type: BOOLEAN, defaultValue: false }
        });
    
        this.status = this.sequelize.define("Status", {
            ID: { type: INTEGER, primaryKey: true, autoIncrement: true },
            StatusType: { type: SMALLINT  },
            Time: { type: TIME }
        });
    
        this.command = this.sequelize.define("Command", {
            ID: { type: INTEGER, primaryKey: true, autoIncrement: true },
            Name: { type: STRING,  unique: true },
            Type: { type: STRING },
            Data: { type: BLOB }
        });
    
        this.runCondition = this.sequelize.define("RunCondition", {
            ID: { type: INTEGER, primaryKey: true, autoIncrement: true },
            RunConditionType: { type: SMALLINT }
        });
    
        this.command.hasMany(this.runCondition);
        this.runCondition.hasMany(this.face);
        this.status.hasMany(this.face);
        this.face.belongsTo(this.status);
        this.face.belongsTo(this.runCondition);
        this.runCondition.belongsTo(this.command);
        
        await this.face.sync();
        await this.status.sync();
        await this.command.sync();
        await this.runCondition.sync();
    }
}