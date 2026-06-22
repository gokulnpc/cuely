import { app, BrowserWindow, ipcMain, screen } from "electron";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let overlayWindow = null;

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

function buildRendererUrl(mode) {
  const baseUrl = readEnv("CUELY_DEV_SERVER_URL", "http://localhost:5173");
  const source = normalizeSource(readEnv("CUELY_DEFAULT_SOURCE", "mock"));
  const url = new URL(baseUrl);
  if (mode === "overlay") {
    url.searchParams.set("mode", "overlay");
  }
  if (source !== "mock") {
    url.searchParams.set("source", source);
  }
  return url.toString();
}

function estimateOverlaySize(state) {
  const width = state?.overlayCompact ? 500 : 720;
  const height = state?.overlayCompact ? 200 : 380;
  return { width, height };
}

function overlayPosition(size, snap) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const x = area.x + Math.round((area.width - size.width) / 2);
  const y =
    snap === "top"
      ? area.y + 30
      : area.y + area.height - size.height - 30;
  return { x, y };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d0e11",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(buildRendererUrl("main"));
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
}

async function createOverlayWindow(state) {
  if (overlayWindow) {
    overlayWindow.focus();
    overlayWindow.webContents.send("overlay:state", state);
    return;
  }

  const size = estimateOverlaySize(state);
  const position = overlayPosition(size, state?.overlayPos === "top" ? "top" : "bottom");

  overlayWindow = new BrowserWindow({
    ...position,
    ...size,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.webContents.send("overlay:closed");
    }
  });

  await overlayWindow.loadURL(buildRendererUrl("overlay"));
  overlayWindow.once("ready-to-show", () => {
    overlayWindow?.show();
    overlayWindow?.webContents.send("overlay:state", state);
    mainWindow?.hide();
  });
}

function closeOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
    return;
  }
  overlayWindow.close();
  overlayWindow = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

function registerIpc() {
  ipcMain.handle("overlay:open", async (_event, state) => {
    await createOverlayWindow(state);
  });

  ipcMain.handle("overlay:close", () => {
    closeOverlayWindow();
  });

  ipcMain.on("overlay:push-state", (_event, state) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("overlay:state", state);
    }
  });

  ipcMain.on("overlay:action", (_event, action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("overlay:action", action);
    }
  });

  ipcMain.on("overlay:resize", (_event, size) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const bounds = overlayWindow.getBounds();
    const nextWidth = Math.max(320, Math.round(size.width));
    const nextHeight = Math.max(120, Math.round(size.height));
    const centerX = bounds.x + Math.round(bounds.width / 2);
    const bottomY = bounds.y + bounds.height;
    overlayWindow.setBounds({
      x: centerX - Math.round(nextWidth / 2),
      y: bottomY - nextHeight,
      width: nextWidth,
      height: nextHeight,
    });
  });

  ipcMain.on("overlay:snap", (_event, position) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const bounds = overlayWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const area = display.workArea;
    const y =
      position === "top"
        ? area.y + 30
        : area.y + area.height - bounds.height - 30;
    overlayWindow.setPosition(bounds.x, y);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (globalThis.process?.platform !== "darwin") {
    app.quit();
  }
});
