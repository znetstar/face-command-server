import * as express from "express";
import * as path from "path";
import AppResources from "./AppResources";

const app = express();

export default (resources: AppResources) => {
    app.use('/', express.static(path.join(__dirname, "..", "node_modules", 'face-command-web', 'dist', 'face-command-web')));
    
    return app;
};