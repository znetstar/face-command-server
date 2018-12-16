import { CommandTypeBase, CommandOptions } from "face-command-common";
import { LockScreen as DoLock } from "screen-lock";

export default class LockScreen extends CommandTypeBase {
    public async Run(commandOptions: CommandOptions): Promise<any> {
        DoLock();
    }
}