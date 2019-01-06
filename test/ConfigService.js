const { assert } = require("chai");
const lodash = require("lodash");
const random = require("./random");
const temp = require("temp");
const fs = require("fs").promises;
temp.track();

function randomObj(depth, index) {
    index = index || 0;
    depth = depth || 1;
    const obj = {};
    const numProperties = random.chance.integer({ min: 1, max: 15 });
    
    for (let i = 0; i < numProperties; i++) {
        let val;
        if (index >= depth) 
            val = random.chance.string();
        else 
            val = randomObj(depth, ++index);
        
        obj[random.chance.string()] = val;
    }

    return obj;
}

describe("ConfigService", function () {
    describe("#constructor()", function () {
        it("should create successfully", async function () {
            await random.configSvc();
        });
    });

    describe("#GetConfigValue()", function () {
        it("should retrieve a value from nconf", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = random.chance.string();
            const value = random.chance.string();

            res.nconf.set(key, value);

            const resValue = await cfgSvc.GetConfigValue(key);
            assert.equal(value, resValue);
        });

        it("should not send hidden properties from nconf", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = random.chance.string();
            const value = random.chance.string();

            cfgSvc.hiddenProperties.add(key);
            res.nconf.set(key, value);

            const resValue = await cfgSvc.GetConfigValue(key);
            assert.notOk(resValue);
        });
    });

    describe("#SetConfigValue()", function () {
        it("should save a value to nconf", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = random.chance.string();
            const value = random.chance.string();

            await cfgSvc.SetConfigValue(key, value);
            const resValue = res.nconf.get(key);

            assert.equal(value, resValue);
        });

        it("if the key has a ':' delimiter each element should be treated as a subobject", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = [
                random.chance.string(),
                random.chance.string(),
                random.chance.string()
            ];

            const value = random.chance.string();

            await cfgSvc.SetConfigValue(key.join(":"), value);

            const resValue = res.nconf.get(key.join(":"));
            assert.equal(value, resValue);

            const resRoot = res.nconf.get();

            assert.ok(resRoot[key[0]]);
            assert.ok(resRoot[key[0]][key[1]]);
            assert.equal(value, resRoot[key[0]][key[1]][key[2]]);
        });

        it("readonly properties should not be able to be set", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = random.chance.string();
            cfgSvc.readonlyProperties.add(key);
            await cfgSvc.SetConfigValue(key, random.chance.string());

            const resValue = res.nconf.get(key);

            assert.notOk(resValue);
        });

        it("hidden properties should not be able to be set", async function () {
            const res = await random.appResources();
            const cfgSvc = await random.configSvc(res);
            const key = random.chance.string();
            cfgSvc.hiddenProperties.add(key);
            await cfgSvc.SetConfigValue(key, random.chance.string());

            const resValue = res.nconf.get(key);

            assert.notOk(resValue);
        });
    });

    describe("#GetConfig()", function () {
        it("should retrieve all configuration values set", async function () {
            const res = await random.appResources({});
            res.nconf.use("memory");
            const cfgSvc = await random.configSvc(res);
            
            const obj = randomObj();

            for (let key in obj) {
                res.nconf.set(key, obj[key]);
            }

            const resConfig = await cfgSvc.GetConfig();
            obj.type = "literal";
            assert.deepEqual(obj, resConfig);           
        });

        it("should exclude hidden properties", async function () {
            const res = await random.appResources({});
            res.nconf.use("memory");
            const cfgSvc = await random.configSvc(res);
            
            const obj = randomObj();
            const keys = Object.keys(obj);

            for (let key in obj) {
                res.nconf.set(key, obj[key]);
            }

            cfgSvc.hiddenProperties.add(keys[0]);

            const resConfig = await cfgSvc.GetConfig();
            obj.type = "literal";
            delete obj[keys[0]];
            assert.deepEqual(obj, resConfig);           
        });
    });

    describe("#SetConfig()", function () {
        it("should apply all properties of the provided object to the nconf configuration", async function () {
            const res = await random.appResources({});
            res.nconf.use("memory");
            const cfgSvc = await random.configSvc(res);
            
            const obj = randomObj(3);

            await cfgSvc.SetConfig(obj);

            obj.type = 'literal';
            assert.deepEqual(obj, res.nconf.get());           
        });

        it("the function should not step through arrays", async function () {
            const res = await random.appResources({});
            res.nconf.use("memory");
            const cfgSvc = await random.configSvc(res);
            
            const obj = randomObj(3);

            const key = random.chance.string();
            const val = [ random.chance.string() ];

            obj[key] = val;

            await cfgSvc.SetConfig(obj);

            assert.deepEqual(val, res.nconf.get(key));           
        });
    });

    describe("#SaveConfig()", function () {
        it("should save the current config to the disk", async function () {
            const sampleCfg = randomObj(3);
            const res = await random.appResources({});
            const cfgSvc = await random.configSvc(res);

            const file = await new Promise((resolve, reject) => {
                temp.open(".json", (err, info) => {
                    if (err) reject(err);
                    resolve(info);
                });
            });

            await fs.writeFile(file.path, "{}");
            res.nconf.file({ file: file.path });

            await cfgSvc.SetConfig(sampleCfg);
            await cfgSvc.SaveConfig();

            const resultRaw = await fs.readFile(file.path, "utf8");
            const result = JSON.parse(resultRaw);

            assert.deepEqual(sampleCfg, result);
        });
    });

    describe("#LoadConfig()", function () {
        it("should load the saved config from the disk", async function () {
            const sampleCfg = randomObj(3);
            const res = await random.appResources({});
            const cfgSvc = await random.configSvc(res);

            const file = await new Promise((resolve, reject) => {
                temp.open(".json", (err, info) => {
                    if (err) reject(err);
                    resolve(info);
                });
            });

            await fs.writeFile(file.path, "{}");
            res.nconf.file({ file: file.path });

            await fs.writeFile(file.path, JSON.stringify(sampleCfg));

            await cfgSvc.LoadConfig();
            const result = await cfgSvc.GetConfig();

            delete result.type;

            assert.deepEqual(sampleCfg, result);
        });
    });
});