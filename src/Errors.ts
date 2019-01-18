import { ServerError } from "multi-rpc-common";

export class CommandExecutionError extends ServerError {
    static get ERROR_CODE(): number { return -32032; }

    constructor(error: Error) {
        super(CommandExecutionError.ERROR_CODE, {
            name: error.name,
            message: error.message
        });
    }
} 