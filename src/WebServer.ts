import * as express from "express";
import * as path from "path";
import AppResources from "./AppResources";

const app = express();

export const webInterfacePath = path.join(__dirname, "..", "node_modules", 'face-command-web', 'dist', 'face-command-web');

export default (resources: AppResources) => {
    app.use('/', express.static(webInterfacePath));
    
    app.use((req, res, next) => {
        res.sendfile(path.join(webInterfacePath, "index.html"));
    });

    return app;
};