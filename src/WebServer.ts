import * as express from "express";
import AppResources from "./AppResources";

const app = express();

export default (resources: AppResources) => {

    app.get("/", (req, res) => {
        res.send("HI!")
    });

    return app;
};