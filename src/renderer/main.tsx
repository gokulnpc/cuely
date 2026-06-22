import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OverlayApp } from "./OverlayApp";
import { getCuelyShell } from "./cuely-shell";

const shell = getCuelyShell();
const isOverlay =
  shell?.isOverlayMode() ?? new URLSearchParams(window.location.search).get("mode") === "overlay";

if (isOverlay) {
  document.documentElement.classList.add("cuely-overlay-mode");
} else if (navigator.userAgent.includes("Electron")) {
  document.documentElement.classList.add("cuely-electron");
}

const container = document.getElementById("root");

if (container) {
  const root = createRoot(container);
  root.render(isOverlay ? <OverlayApp /> : <App />);
}
