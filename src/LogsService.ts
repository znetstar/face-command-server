import { LogsServiceBase, LogEntry } from "face-command-common";
import AppResources from "./AppResources";

/**
 * A service that sends log entries to the client.
 */
export default class LogsService extends LogsServiceBase {
    constructor(protected resources: AppResources) {
        super(resources);
        resources.logger.on("data", this.emitLogEntry.bind(this));
    }

    private emitLogEntry(rawLogEntry: any) {
        const logEntry = new LogEntry(rawLogEntry.message, rawLogEntry.level, new Date());
        this.emit("LogEntry", logEntry);
    }

    /**
     * Sends existing logs to the client.
     * @param start 
     */
    public async StreamHistory(start: number = -1): Promise<void> {
        this.resources.logger.stream({ start }).on("log", this.emitLogEntry.bind(this));
    } 
}