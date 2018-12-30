import * as path from "path";
import { Server as HTTPServer } from "http";

import { Provider } from "nconf";
import * as winston from "winston";
import { Logger as ILogger } from "winston";
import { Sequelize as ISequalize } from "sequelize";
import * as Sequelize from "Sequelize";
import yargs from "yargs"; 
import * as fs from "fs-extra-promise";
import { Server as RPCServer, WebSocketTransport, HTTPTransport, MsgPackSerializer } from "multi-rpc";
import { Face, DetectionOptions, EigenFaceRecognizerOptions } from "face-command-common";

import AppResources, { WinstonSilentLogger } from './AppResources';
import default_configuration, { env_whitelist } from "./default_configuration";
import DatabaseModels from "./DatabaseModels";
import { default as expressApp } from "./WebServer";
import RPCInterface, { default as setupRPC } from "./RPCInterface";
import FaceManagementService from "./FaceManagementService";
import DetectionService from "./DetectionService";
import CommandService from "./CommandService";
import ConfigService from "./ConfigService";
import { default as FaceCapture } from "./FaceCapture";

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
export async function Main(nconf?: Provider, sequelize?: ISequalize, logger?: ILogger) {
   /* Configures application resources */ 
    if (!nconf) {
        nconf = new Provider();

        const yargsInstance = yargs({})
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
                transform: (obj: any) => {
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
            format: winston.format.simple(),
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

    const rpc = new RPCServer();
    const resources = new AppResources(nconf, database, logger, rpc);
    
    /* Listen on RPC */
    logger.debug("Starting RPC server");

    const { faceManagementService, detectionService, commandService, configService } = RPCInterface(resources, rpc);
    
    const httpServerConfig = nconf.get("httpServer");

    let listenHTTP = () => {};

    if (nconf.get("httpServer")) {
        const httpServer = new HTTPServer(expressApp(resources));
        const msgPack = new MsgPackSerializer();
        const endpoint = nconf.get("endpoint")

        const wsTransport = new WebSocketTransport(msgPack, httpServer, endpoint);
        rpc.addTransport(wsTransport);

        listenHTTP = () => {
            const host = nconf.get("host");
            const port = nconf.get("port");

            httpServer.listen(port, host, (error: Error) => {
                if (error) {
                    logger.error(`Error binding to ${host}:${port}`);
                }
                logger.info(`RPC listening on ws://${host}:${port}${endpoint}`);
            });
        };
    }

    const additonalTransports = nconf.get("rpcTransports");
    
    for (const transport of additonalTransports) {
        rpc.addTransport(transport);
    }

    await rpc.listen();
    logger.debug("RPC server has started");

    listenHTTP();

    /* Autostart detection */
    if (nconf.get("autostartDetection")) {
        logger.debug("Starting detection");

        const recOptions = new EigenFaceRecognizerOptions(nconf.get("eigenFaceRecognizerOptions:components"), nconf.get("eigenFaceRecognizerOptions:threshold"));
        const autostartDetectionOptions = new DetectionOptions(nconf.get("imageCaptureFrequency"), recOptions, [], true);

        await detectionService.StartDetection(autostartDetectionOptions);
    }

    logger.info("Application started");
};

Main();