import { contextBridge, ipcRenderer } from "electron";

function overlayModeFromLocation() {
  return new URLSearchParams(globalThis.location.search).get("mode") === "overlay";
}

contextBridge.exposeInMainWorld("cuelyShell", {
  isOverlayMode: () => overlayModeFromLocation(),
  openOverlay: (state) => ipcRenderer.invoke("overlay:open", state),
  closeOverlay: () => ipcRenderer.invoke("overlay:close"),
  pushOverlayState: (state) => ipcRenderer.send("overlay:push-state", state),
  onOverlayState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("overlay:state", handler);
    return () => ipcRenderer.removeListener("overlay:state", handler);
  },
  sendOverlayAction: (action) => ipcRenderer.send("overlay:action", action),
  onOverlayAction: (listener) => {
    const handler = (_event, action) => listener(action);
    ipcRenderer.on("overlay:action", handler);
    return () => ipcRenderer.removeListener("overlay:action", handler);
  },
  setOverlaySize: (size) => ipcRenderer.send("overlay:resize", size),
  snapOverlay: (position) => ipcRenderer.send("overlay:snap", position),
  onOverlayClosed: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("overlay:closed", handler);
    return () => ipcRenderer.removeListener("overlay:closed", handler);
  },
});
