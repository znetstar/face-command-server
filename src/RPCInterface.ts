import { Server as RPCServer } from "multi-rpc";
import { Error as SequelizeError } from "sequelize";
import AppResources from "./AppResources";
import FaceManagementService from "./FaceManagementService";
import DetectionService from "./DetectionService";
import CommandService from "./CommandService";
import { CommandExecutionError } from "./Errors";
import { default as FaceCapture } from "./FaceCapture";
import { Command } from "face-command-common";

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
    const commandService = new CommandService(resources, detectionService);

    rpcServer.methods.faceManagement = {
        AddFace: wrap(faceManagementService, faceManagementService.AddFace),
        AddFaceFromCamera: wrap(faceManagementService, faceManagementService.AddFaceFromCamera),
        GetFace: wrap(faceManagementService, faceManagementService.GetFace),
        GetFaces: wrap(faceManagementService, faceManagementService.GetFaces),
        RemoveFace: wrap(faceManagementService, faceManagementService.RemoveFace),
        UpdateFace: wrap(faceManagementService, faceManagementService.UpdateFace)
    };

    rpcServer.methods.detection = {
        AddStatus: wrap(detectionService, detectionService.AddStatus),
        DetectChanges: wrap(detectionService, detectionService.DetectChanges),
        GetStatus: wrap(detectionService, detectionService.GetStatus),
        StartDetection: wrap(detectionService, detectionService.StartDetection),
        StatusHistory: wrap(detectionService, detectionService.StatusHistory),
        StopDetection: wrap(detectionService, detectionService.StopDetection)
    };

    rpcServer.methods.commands = {
        AddCommand: wrap(commandService, commandService.RPC_AddCommand),
        GetCommand: wrap(commandService, commandService.GetCommand),
        GetCommands: wrap(commandService, commandService.GetCommands),
        RemoveCommand: wrap(commandService, commandService.RemoveCommand),
        UpdateCommand: wrap(commandService, commandService.UpdateCommand)
    };

    return {
        faceManagementService, 
        detectionService,
        commandService
    }
}