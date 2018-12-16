import * as express from "express";
import AppResources from "./AppResources";

const app = express();

export default (resources: AppResources) => {
    return app;
};