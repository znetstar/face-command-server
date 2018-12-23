import { Server as RPCServer, Notification } from "multi-rpc";
import AppResources from "./AppResources";
import FaceManagementService from "./FaceManagementService";
import DetectionService from "./DetectionService";
import CommandService from "./CommandService";
import ConfigService from "./ConfigService";
import { CommandExecutionError } from "./Errors";
import { default as FaceCapture } from "./FaceCapture";
import { EventEmitter2 as EventEmitter } from "eventemitter2";

/**
 * Runs the function 
 * 
 * @ignore
 * @param context - Context ('this' object) the function should run in.;
 * @param func - Function to run.
 */
function wrap(context: any, func: Function) {
    return async function () {
        try {
            return await func.apply(context, arguments);
        } catch (error) {
            throw new CommandExecutionError(error);
        }
    };
}

export default (resources: AppResources, rpcServer: RPCServer) => {
    const capture = new FaceCapture(resources);
    const faceManagementService = new FaceManagementService(resources, capture);
    const detectionService = new DetectionService(resources, capture);

    function notifyOnEvent(eventEmitter: EventEmitter, eventName: string) {
        function notifyHandler() {
            const notification = new Notification(eventName, Array.from(arguments));
            rpcServer.sendAll(notification);
        }

        eventEmitter.on(eventName, notifyHandler);

        return notifyHandler;
    }

    notifyOnEvent(detectionService, "StatusChange")
    notifyOnEvent(detectionService, "DetectionRunning")

    const commandService = new CommandService(resources, detectionService);
    const configService = new ConfigService(resources);

    rpcServer.methods.faceManagement = {
        AddFace: wrap(faceManagementService, faceManagementService.AddFace),
        AddFaceFromCamera: wrap(faceManagementService, faceManagementService.AddFaceFromCamera),
        GetFace: wrap(faceManagementService, faceManagementService.GetFace),
        GetFaces: wrap(faceManagementService, faceManagementService.GetFaces),
        RemoveFace: wrap(faceManagementService, faceManagementService.RemoveFace),
        UpdateFace: wrap(faceManagementService, faceManagementService.UpdateFace)
    };

    rpcServer.methods.detection = {
        DetectChanges: wrap(detectionService, detectionService.DetectChanges),
        StartDetection: wrap(detectionService, detectionService.RPC_StartDetection),
        StatusHistory: wrap(detectionService, detectionService.StatusHistory),
        StopDetection: wrap(detectionService, detectionService.StopDetection),
        IsDetectionRunning: wrap(detectionService, detectionService.IsDetectionRunning)
    };

    rpcServer.methods.commands = {
        AddCommand: wrap(commandService, commandService.RPC_AddCommand),
        GetCommand: wrap(commandService, commandService.GetCommand),
        GetCommands: wrap(commandService, commandService.GetCommands),
        RemoveCommand: wrap(commandService, commandService.RemoveCommand),
        UpdateCommand: wrap(commandService, commandService.UpdateCommand),
        GetCommandTypeNames: wrap(commandService, commandService.GetCommandTypeNames)
    };

    rpcServer.methods.config = {
        GetConfigValue: wrap(configService, configService.GetConfigValue),
        GetConfig: wrap(configService, configService.GetConfig),
        SetConfigValue: wrap(configService, configService.SetConfigValue),
        SaveConfig: wrap(configService, configService.SaveConfig),
        LoadConfig: wrap(configService, configService.LoadConfig)
    }; 

    return {
        faceManagementService, 
        detectionService,
        commandService,
        configService
    }
}