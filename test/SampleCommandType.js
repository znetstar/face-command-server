const { CommandTypeBase } = require("face-command-common");

class SampleCommandType extends CommandTypeBase {
    constructor(resources) {
        super(resources);
    }

    async Run(commandOptions) {
        return commandOptions.data;
    }
}

module.exports.default = SampleCommandType;