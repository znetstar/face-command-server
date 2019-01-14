import { Server as RPCServer, Notification } from "multi-rpc";
import { EventEmitter2 as EventEmitter } from "eventemitter2";
import AppResources from "./AppResources";
import FaceManagementService from "./FaceManagementService";
import DetectionService from "./DetectionService";
import CommandService from "./CommandService";
import ConfigService from "./ConfigService";
import { CommandExecutionError } from "./Errors";
import { default as FaceCapture } from "./FaceCapture";
import LogsService from "./LogsService";
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
    const { nconf } = resources;
    
    const capture = new FaceCapture(resources, nconf.get("captureDevicePort"), nconf.get("cascadeClassifier"));
    const faceManagementService = new FaceManagementService(resources, capture);
    const detectionService = new DetectionService(resources, capture);

    function notifyOnEvent(eventEmitter: EventEmitter, eventName: string, prefix?: string) {
        function notifyHandler() {
            const notification = new Notification(prefix+'.'+eventName, Array.from(arguments));
            rpcServer.sendAll(notification);
        }

        eventEmitter.on(eventName, notifyHandler);

        return notifyHandler;
    }

    notifyOnEvent(detectionService, "StatusChange", "detection")
    notifyOnEvent(detectionService, "DetectionRunning", "detection")

    const commandService = new CommandService(resources, detectionService);
    const configService = new ConfigService(resources);
    const logsService = new LogsService(resources);

    notifyOnEvent(logsService, "LogEntry", "logs")

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
        IsDetectionRunning: wrap(detectionService, detectionService.IsDetectionRunning),
        GetLastStatus: wrap(detectionService, detectionService.GetLastStatus)
    };

    rpcServer.methods.commands = {
        AddCommand: wrap(commandService, commandService.RPC_AddCommand),
        GetCommand: wrap(commandService, commandService.RPC_GetCommand),
        GetCommands: wrap(commandService, commandService.RPC_GetCommands),
        RemoveCommand: wrap(commandService, commandService.RemoveCommand),
        UpdateCommand: wrap(commandService, commandService.UpdateCommand),
        GetCommandTypeNames: wrap(commandService, commandService.GetCommandTypeNames)
    };

    rpcServer.methods.config = {
        GetConfigValue: wrap(configService, configService.GetConfigValue),
        GetConfig: wrap(configService, configService.GetConfig),
        SetConfigValue: wrap(configService, configService.SetConfigValue),
        SetConfig: wrap(configService, configService.SetConfig),
        SaveConfig: wrap(configService, configService.SaveConfig),
        LoadConfig: wrap(configService, configService.LoadConfig)
    }; 

    rpcServer.methods.logs = {
        StreamHistory: wrap(logsService, logsService.StreamHistory)
    };

    return {
        faceManagementService, 
        detectionService,
        commandService,
        configService,
        logsService
    }
}