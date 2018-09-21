import path from "path";

import AppResource, { WinstonSilentLogger } from './AppResources';
import { Provider } from "nconf";
import winston, { Logger as ILogger } from "winston";
import Sequelize, { Sequelize as ISequalize } from "sequelize";
import yargs from "yargs"; 
import fs from "fs-extra-promise";

import default_configuration, { env_whitelist } from "./default_configuration";
import AppResources from "./AppResources";
import FaceManagementService from "./FaceManagementService";
import DetectionService from "./DetectionService";
import { Face } from "face-command-common";
import DatabaseModels from "./DatabaseModels";

/**
 * The contents of package.json
 */
const pkg = Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")));

/**
 * Converts a configuration property's name from env variable format to application config format
 * `"CONTROL_HOST"` -> `"controlHost"` 
 * @param env - Environment variable
 * @ignore
 */
function formatEnv(env: string): string {
	let a = env.toLowerCase().split('_');
	let i = 1;
	while (i < a.length) {
		a[i] = a[i][0].toUpperCase() + a[i].substr(1);
		i++;
	}
	return a.join('');
 }

/**
 * This is the main entrypoint for the application. It will be called from the "bin/face-command-server" script.
 * It can be called from outside this package to start the server elsewhere.
 * Calling this function will setup the application, connect to the database, read configuration, etc.
 * 
 * @param nconf - An existing nconf.Provider to provide the application configuration.
 * @param database - An existing instance of Sqlite.Database
 * @param logger - An existing winston Logger to use for logging. To disabling set to null.
 * @async
 * @returns {Promise} - A promise that will resolve when the application has started.
 */
export async function main(nconf?: Provider, sequelize?: ISequalize, logger?: ILogger) {
   /* Configures application resources */ 
    if (!nconf) {
        nconf = new Provider();

        const yargsInstance = yargs()
            .version(pkg.version)
            .usage("face-command-server [arguments]")
            .strict()
            .option("logLevel", {
                alias: "l",
                describe: "Log level for application logging, can be: silent, silly, debug, verbose, info, warn, or error in order of verbosity. For example setting logLevel to info would not show logs from the lower levels."
            })
            .option("config", {
                alias: "f",
                describe: "Path to a json configuration to read from."
            });

        nconf
            .argv(yargsInstance)
            .env({
                whitelist: env_whitelist.concat(env_whitelist.map(formatEnv)),
                parseValues: true,
                transform: (obj) => {
                    if (env_whitelist.includes(obj.key)) {
                        if (obj.key.indexOf('_') !== -1) {
                            obj.key = formatEnv(obj.key);
                        }
                    }
                    return obj;
                }
            });

        const configPath = nconf.get("config");

        if (configPath && !fs.existsSync(configPath)) {
            console.error(`Configuration file "${configPath}" set does not exist. Exiting`);
            process.exit(1);
            return;
        } else if (configPath) {
            nconf.file(configPath);
        } else {
            nconf.use('memory');
        }

        nconf.defaults(default_configuration);
    }

    const logLevel = nconf.get("logLevel");

    if (logger === null || !logLevel || logLevel === 'silent') {
        logger = WinstonSilentLogger;
    }
    else if (typeof(logger) === 'undefined') {
        logger = winston.createLogger({
            level: logLevel,
            transports: [
                new winston.transports.Console()
            ]
        });
    } 

    if (!sequelize) {
        sequelize = new Sequelize(nconf.get("databaseUrl"));

        await sequelize.authenticate();
    }

    let database = new DatabaseModels(sequelize);
    await database.create();

    const resources = new AppResources(nconf, database, logger);
    /* Starts application services */

    const faceManagementService = new FaceManagementService(resources);
    const detectionService = new DetectionService(resources);
    
};