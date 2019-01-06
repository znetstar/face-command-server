const { CommandTypeBase } = require("face-command-common");

class ErrorCommandType extends CommandTypeBase {
    constructor(resources) {
        super(resources);
    }

    async Run(commandOptions) {
        throw new Error(require("chance")().string());
    }
}

module.exports.default = ErrorCommandType;