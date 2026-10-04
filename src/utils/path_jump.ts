// Pure helpers for the path palette (Ctrl+P). This module imports nothing
// from the app so `node --test src/utils/path_jump.test.ts` can run it.

export interface JumpTarget {
  /** Absolute OpenList path the input points at. */
  path: string
  /** Directory whose entries complete the input. */
  dir: string
  /** Last, unfinished segment typed inside `dir` ("" after a trailing /). */
  partial: string
}

export interface JumpEntry {
  name: string
  is_dir: boolean
}

/** Collapse slashes and resolve "." / ".." segments, clamped at root. */
export const normalizeJumpPath = (path: string): string => {
  const out: string[] = []
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") out.pop()
    else out.push(seg)
  }
  return "/" + out.join("/")
}

const parentOf = (path: string): string =>
  normalizeJumpPath(path.split("/").slice(0, -1).join("/"))

/**
 * Turn what the user typed into an OpenList path. Absolute paths are taken
 * as they are, relative ones are joined to `base`, and a pasted URL
 * contributes its pathname.
 */
export const resolveJumpInput = (
  raw: string,
  base: string,
): JumpTarget | null => {
  let input = raw.trim().replace(/^(["'`])(.*)\1$/, "$2")
  if (!input) return null
  if (/^https?:\/\//i.test(input)) {
    try {
      input = decodeURIComponent(new URL(input).pathname)
    } catch {
      return null
    }
  } else if (input.startsWith("file://")) {
    input = input.slice("file://".length)
  }
  input = input.replace(/\\/g, "/")
  const joined = input.startsWith("/") ? input : `${base || "/"}/${input}`
  const path = normalizeJumpPath(joined)
  const endsInDir = /\/\.{0,2}$/.test(input) || /(^|\/)\.\.?$/.test(input)
  if (endsInDir || path === "/") {
    return { path, dir: path, partial: "" }
  }
  return {
    path,
    dir: parentOf(path),
    partial: path.split("/").pop() ?? "",
  }
}

/** Show `path` relative to `base` when it lies inside it. */
export const displayJumpPath = (path: string, base: string): string => {
  const b = normalizeJumpPath(base || "/")
  if (b === "/") return path.slice(1) || "/"
  if (path === b) return "./"
  if (path.startsWith(b + "/")) return path.slice(b.length + 1)
  return path
}

// 0 exact, 1 prefix, 2 substring, 3 in-order subsequence, -1 no match.
const matchScore = (name: string, query: string): number => {
  const n = name.toLowerCase()
  const q = query.toLowerCase()
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  let i = 0
  for (const ch of n) {
    if (ch === q[i]) i++
    if (i === q.length) return 3
  }
  return -1
}

/** Entries of one directory that complete `partial`, best match first. */
export const rankJumpEntries = <T extends JumpEntry>(
  entries: T[],
  partial: string,
  limit: number,
): T[] => {
  const scored = entries
    .map((e) => ({ e, s: partial ? matchScore(e.name, partial) : 1 }))
    .filter((x) => x.s >= 0)
  scored.sort(
    (a, b) =>
      a.s - b.s ||
      Number(b.e.is_dir) - Number(a.e.is_dir) ||
      a.e.name.localeCompare(b.e.name, undefined, { numeric: true }),
  )
  return scored.slice(0, limit).map((x) => x.e)
}

/**
 * History items whose path holds every whitespace-separated token of
 * `query`, case-insensitively. Order (most recent first) is kept.
 */
export const filterJumpHistory = <T extends { path: string }>(
  items: T[],
  query: string,
  limit: number,
): T[] => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items
    .filter((it) => {
      const p = it.path.toLowerCase()
      return tokens.every((t) => p.includes(t))
    })
    .slice(0, limit)
}
