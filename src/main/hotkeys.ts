import type { HotkeyAction } from "../shared/bridge";

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  next: "CommandOrControl+Shift+Right",
  prev: "CommandOrControl+Shift+Left",
  top: "CommandOrControl+Shift+Up",
  "toggle-following": "CommandOrControl+Shift+F",
  "toggle-visible": "CommandOrControl+Shift+V",
};

const HOTKEY_ALIASES: Record<string, HotkeyAction> = {
  next: "next",
  prev: "prev",
  previous: "prev",
  top: "top",
  "toggle-following": "toggle-following",
  follow: "toggle-following",
  "toggle-visible": "toggle-visible",
  visible: "toggle-visible",
};

export function parseHotkeyAction(rawAction: string): HotkeyAction | undefined {
  const normalized = rawAction.trim().toLowerCase();
  return HOTKEY_ALIASES[normalized];
}
