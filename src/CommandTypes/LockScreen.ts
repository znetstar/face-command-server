import { CommandTypeBase, CommandOptions } from "face-command-common";
import { lockScreen } from "@znetstar/lock-screen";

export default class LockScreen extends CommandTypeBase {
    public async Run(commandOptions: CommandOptions): Promise<any> {
        lockScreen();
    }
}