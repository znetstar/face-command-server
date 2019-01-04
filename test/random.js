const Random = require("face-command-common/lib/Random").default;
const Chance = require("chance");
const Nconf = require("nconf");
const winston = require("winston");
const Sequelize = require("sequelize");
const temp = require("temp");
const { AppResources, DatabaseModels } = require("../lib");
const { WinstonSilentLogger } = require("../lib/AppResources");
const { Server } = require("multi-rpc");

temp.track();

module.exports.chance = Chance();
module.exports.common = 
module.exports.appResources = async () => {
    const nconf = new (Nconf.Provider)();
    nconf.use("memory");
    const info = await new Promise((resolve, reject) => {
        temp.open(".sqlite", (err, info) => {
            if (err) reject(err);
            else resolve(info);
        });
    });

    const db = new Sequelize(`sqlite://${info.path}`);
    await db.authenticate();
    const dbModels = new DatabaseModels(db);
    const rpcServer = new Server();
    return new AppResources(nconf, dbModels, WinstonSilentLogger, rpcServer);
};