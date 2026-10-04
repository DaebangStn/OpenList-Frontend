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

export type ShellMessage =
  /** The frame now shows `path`. */
  | { type: "openlist:location"; path: string }
  /** Open `path` in another tab (Ctrl/middle click inside a frame). */
  | { type: "openlist:open"; path: string }
  /** A shell shortcut was pressed while focus was inside a frame. */
  | { type: "openlist:command"; command: "palette" | "close-tab" }

export const postToShell = (msg: ShellMessage) => {
  if (isEmbedded) window.parent.postMessage(msg, location.origin)
}

export const isShellMessage = (data: unknown): data is ShellMessage =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as { type?: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith("openlist:")
