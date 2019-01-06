import { ConfigServiceBase } from "face-command-common";
import { cloneDeep } from "lodash";
import AppResources from "./AppResources";

/**
 * This service allows the user to interact with application configuration.
 */
export default class ConfigService extends ConfigServiceBase {
    /**
     * A set of properties that cannot be changed by the user.
     */
    protected readonlyProperties = new Set<string>([
        "cascadeClassifiers",
        "rpcTransports",
        "commandTypes"
    ]);

    /**
     * A set of properties that will not be sent to the user.
     */
    protected hiddenProperties = new Set<string>([
        'rpcTransports'
    ]);

    /**
     * 
     * @param resources - Common application resources.
     */
    constructor(protected resources: AppResources) { 
        super(resources);
    }

    /**
     * Retrieves a configuration value.
     * @param key - Key of the value to retrieve.
     */
    public async GetConfigValue(key: string): Promise<any> {
        if (this.hiddenProperties.has(key))
            return;

        return this.resources.nconf.get(key);
    } 

    /**
     * Sets a configuration value.
     * @param key - Key of the value to set.
     */
    public async SetConfigValue(key: string, value: any): Promise<void> {
        if (this.readonlyProperties.has(key) || this.hiddenProperties.has(key))
            return;

        this.resources.nconf.set(key, value);
    } 

    /**
     * Retrieves all configuration values.
     */
    public async GetConfig(): Promise<any> {
        const config = cloneDeep(this.resources.nconf.get());
        
        for (let hiddenProp of this.hiddenProperties.values()) {
            delete config[hiddenProp];
        }

        return config;
    }

    /**
     * Applies an object containing properties to the application configuration
     * @param object - Object containing properties.
     * @param parentKey - Root property to apply changes to. Defaults to the root config object.
     */
	public async SetConfig(object: any, parentKey?: string|string[]): Promise<void> {
		parentKey = parentKey ? [].concat(parentKey) : [];

		for (const key in object) {
            let val = object[key];
			if (typeof(val) === 'object' && !Array.isArray(val)) 
				await this.SetConfig(val, parentKey.concat(key));
			else {
				let fullConfigKey = parentKey.concat(key).join(':');
				await this.SetConfigValue(fullConfigKey, val);
			}
		}
    }

    /**
     * If a configuration file has been specified, writes changes to the config file.
     */
    public async SaveConfig(): Promise<void> {
        return new Promise<void>((resolve, reject) => this.resources.nconf.save((error?: Error) => { if (error) { return reject(error); } resolve(); }))
    }

    /**
     * If a configuration file has been specified, loads changes from the config file.
     */
    public async LoadConfig(): Promise<void> {
        return new Promise<void>((resolve, reject) => this.resources.nconf.load((error?: Error) => { if (error) { return reject(error); } resolve(); }))
    }
}