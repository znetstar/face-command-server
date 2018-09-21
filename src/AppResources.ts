import { Provider } from "nconf";
import * as winston from "winston";
import { Logger as ILogger } from "winston";
import DatabaseModels from "./DatabaseModels";

/**
 * This object is a silent Winston logger. Using it will disable logging.
 * @constant
 */
const WinstonSilentLogger = winston.createLogger({ silent: true });
export { WinstonSilentLogger };

/**
 * This object contains the common resources (database, logger, etc) used by the application.
 */
export default class AppResources {
    /**
     * The Nconf.Provider instance that contains application configuration.
     */
    public get Nconf(): Provider { return this.nconf; }
    /**
     * The Sequelize instance for the application.
     */
    public get Database(): DatabaseModels { return this.database; }
    /**
     * The Winston.Logger instance for the application.
     */
    public get Logger(): ILogger { return this.logger; }

    /**
     * Creates an AppResources object.
     * 
     * @param nconf - An Nconf.Provider instance.
     * @param database - An object containing database models.
     * @param logger - An optional Winston logger instance. If not provided will use a silent logger, disabling logging.
     * @throws {InvalidNconfError} - If the object provided for the "nconf" field is not a Nconf.Provider instance.
     */
    constructor(private nconf: Provider, private database: DatabaseModels, private logger: ILogger = WinstonSilentLogger) {
    }
}