// The tab shell (/@tabs) shows every tab as an iframe of the normal UI.
// Inside such a frame the UI drops its chrome and talks to the shell through
// these messages.

export const isEmbedded = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

export type ShellCommand =
  | "palette-new" // palette; the pick opens in a new tab
  | "palette-replace" // palette; the pick replaces the active tab
  | "duplicate-tab"
  | "close-tab"
  | "reopen-tab"

export type ShellMessage =
  /** The frame now shows `path`. */
  | { type: "openlist:location"; path: string }
  /** Open `path` in another tab (Ctrl/middle click inside a frame). */
  | { type: "openlist:open"; path: string }
  /** A shell shortcut was pressed while focus was inside a frame. */
  | { type: "openlist:command"; command: ShellCommand }

export const postToShell = (msg: ShellMessage) => {
  if (isEmbedded) window.parent.postMessage(msg, location.origin)
}

export const isShellMessage = (data: unknown): data is ShellMessage =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as { type?: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith("openlist:")

/** True when the key went to something the user types into (inputs, editors,
 * contenteditable, also inside shadow roots), so bare-key shortcuts stay off. */
export const isTypingTarget = (e: KeyboardEvent) => {
  const el = (e.composedPath()[0] ?? e.target) as HTMLElement | null
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true
  return !!el.closest(".monaco-editor, [contenteditable=true]")
}

/** Bare-key shell shortcuts: n / N open the palette into the active / a new
 * tab, t duplicates the active tab, w closes it, Shift+T reopens the last
 * closed one. Ctrl+T/W belong to the browser and cannot be taken over. */
export const shellCommandForKey = (e: KeyboardEvent): ShellCommand | null => {
  if (e.ctrlKey || e.metaKey || e.repeat || isTypingTarget(e)) return null
  if (e.altKey) return e.key.toLowerCase() === "w" ? "close-tab" : null
  const commands: Record<string, ShellCommand> = {
    n: "palette-replace",
    N: "palette-new",
    t: "duplicate-tab",
    T: "reopen-tab",
    w: "close-tab",
  }
  return commands[e.key] ?? null
}
