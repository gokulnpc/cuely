import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readEnv(name, fallback) {
  const envRecord =
    typeof globalThis === "object" &&
    "process" in globalThis &&
    globalThis.process &&
    typeof globalThis.process === "object"
      ? globalThis.process.env
      : undefined;
  const value = envRecord?.[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeSource(raw) {
  if (raw === "cloud" || raw === "native" || raw === "mock") {
    return raw;
  }
  return "mock";
}

function buildRendererUrl() {
  const baseUrl = readEnv("CUELY_DEV_SERVER_URL", "http://localhost:5173");
  const source = normalizeSource(readEnv("CUELY_DEFAULT_SOURCE", "mock"));
  const url = new URL(baseUrl);
  if (source !== "mock") {
    url.searchParams.set("source", source);
  }
  return url.toString();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0d14",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void window.loadURL(buildRendererUrl());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (globalThis.process?.platform !== "darwin") {
    app.quit();
  }
});
