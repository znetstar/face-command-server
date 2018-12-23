import { CommandTypeBase, CommandOptions } from "face-command-common";
import { lockScreen } from "@znetstar/lock-screen";
import AppResources from "../AppResources";

export default class LockScreen extends CommandTypeBase {
    constructor(protected resources: AppResources) {
        super(resources);
    }

    public async Run(commandOptions: CommandOptions): Promise<any> {
        lockScreen();
    }
}