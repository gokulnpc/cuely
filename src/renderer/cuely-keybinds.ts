import type { KeyBind, KeyBindMap } from "./cuely-types";

export function defaultKeyBinds(): KeyBindMap {
  return {
    next: { alt: true, ctrl: false, shift: false, meta: false, code: "ArrowRight", label: "⌥ →" },
    prev: { alt: true, ctrl: false, shift: false, meta: false, code: "ArrowLeft", label: "⌥ ←" },
    top: { alt: true, ctrl: false, shift: false, meta: false, code: "ArrowUp", label: "⌥ ↑" },
    close: { alt: false, ctrl: false, shift: false, meta: false, code: "Escape", label: "Esc" },
    compact: { alt: true, ctrl: false, shift: false, meta: false, code: "KeyC", label: "⌥ C" },
    opacityDown: { alt: true, ctrl: false, shift: false, meta: false, code: "BracketLeft", label: "⌥ [" },
    opacityUp: { alt: true, ctrl: false, shift: false, meta: false, code: "BracketRight", label: "⌥ ]" },
  };
}

function keyName(event: KeyboardEvent): string {
  const map: Record<string, string> = {
    ArrowRight: "→",
    ArrowLeft: "←",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
    Space: "Space",
    Enter: "Enter",
    Backspace: "⌫",
    Tab: "Tab",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
  };
  const fromKey = map[event.key];
  if (fromKey) return fromKey;
  const fromCode = map[event.code];
  if (fromCode) return fromCode;
  if (event.code.startsWith("Key")) return event.code.slice(3);
  if (event.code.startsWith("Digit")) return event.code.slice(5);
  return event.key.length === 1 ? event.key.toUpperCase() : event.key || "?";
}

export function comboLabel(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey) parts.push("⌘");
  if (event.ctrlKey) parts.push("⌃");
  if (event.altKey) parts.push("⌥");
  if (event.shiftKey) parts.push("⇧");
  parts.push(keyName(event));
  return parts.join(" ");
}

export function keyBindFromEvent(event: KeyboardEvent): KeyBind {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    code: event.code,
    label: comboLabel(event),
  };
}

export function matchesKeyBind(event: KeyboardEvent, bind: KeyBind | undefined): boolean {
  if (!bind) return false;
  return (
    event.code === bind.code &&
    event.altKey === bind.alt &&
    event.ctrlKey === bind.ctrl &&
    event.shiftKey === bind.shift &&
    event.metaKey === bind.meta
  );
}

export const KEYBIND_ROWS: { key: keyof KeyBindMap; label: string; hint: string }[] = [
  { key: "next", label: "Next cue", hint: "Advance forward" },
  { key: "prev", label: "Previous cue", hint: "Step back" },
  { key: "top", label: "Jump to top", hint: "Back to the first cue" },
  { key: "close", label: "Exit live overlay", hint: "Close the floating card" },
  { key: "compact", label: "Toggle compact", hint: "Shrink / expand the card" },
  { key: "opacityDown", label: "More transparent", hint: "Lower the card opacity" },
  { key: "opacityUp", label: "More opaque", hint: "Raise the card opacity" },
];
