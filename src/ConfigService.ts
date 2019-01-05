import { ConfigServiceBase } from "face-command-common";
import { cloneDeep } from "lodash";
import AppResources from "./AppResources";

export default class ConfigService extends ConfigServiceBase {
    private readonlyProperties = new Set([]);

    constructor(protected resources: AppResources) { 
        super(resources);
        resources.logger.on("logging", (transport, level, msg, meta) => {
            
        });
    }

    public async GetConfigValue(key: string): Promise<any> {
        return this.resources.nconf.get(key);
    } 

    public async SetConfigValue(key: string, value: any): Promise<void> {
        // Prevents arrays from being set.
        if (key.indexOf(":") !== -1) {
            const base = key.split(":").shift();
            
            if (Array.isArray(this.resources.nconf.get(base))) 
                return;
        }

        if (this.readonlyProperties.has(key))
            return;

        this.resources.nconf.set(key, value);
    } 

    public async GetConfig(): Promise<any> {
        const config = cloneDeep(this.resources.nconf.get());
        delete config.rpcTransports;
        return config;
    }
    
	public async SetConfig(object: any, parentKey?: string|string[]): Promise<void> {
		parentKey = parentKey ? [].concat(parentKey) : [];

		for (const key in object) {
			let val = object[key];
			if (typeof(val) === 'object')
				await this.SetConfig(val, parentKey.concat(key));
			else {
				let fullConfigKey = parentKey.concat(key).join(':');
				await this.SetConfigValue(fullConfigKey, val);
			}
		}
    }

    public async SaveConfig(): Promise<void> {
        return new Promise<void>((resolve, reject) => this.resources.nconf.save((error?: Error) => { if (error) { return reject(error); } resolve(); }))
    }

    public async LoadConfig(): Promise<void> {
        return new Promise<void>((resolve, reject) => this.resources.nconf.load((error?: Error) => { if (error) { return reject(error); } resolve(); }))
    }
}