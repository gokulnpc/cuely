import { contextBridge } from "electron";
import { bootstrapMainProcess } from "../src/main/index.ts";

const bridge = bootstrapMainProcess();
contextBridge.exposeInMainWorld("cuely", bridge);
