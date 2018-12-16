import { CommandTypeBase, CommandOptions } from "face-command-common";
import { lockScreen } from "lock-screen";

export default class LockScreen extends CommandTypeBase {
    public async Run(commandOptions: CommandOptions): Promise<any> {
        lockScreen();
    }
}