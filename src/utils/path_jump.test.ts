/// <reference types="node" />
// Run with: node --test src/utils/path_jump.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  displayJumpPath,
  filterJumpHistory,
  normalizeJumpPath,
  rankJumpEntries,
  resolveJumpInput,
} from "./path_jump.ts"

const BASE = "/home/geon/pgn"

test("normalize collapses slashes and dot segments", () => {
  assert.equal(normalizeJumpPath("//a/./b//c/../d/"), "/a/b/d")
  assert.equal(normalizeJumpPath("/../.."), "/")
})

test("relative input joins the base", () => {
  assert.deepEqual(resolveJumpInput("shortcuts/fig.png", BASE), {
    path: "/home/geon/pgn/shortcuts/fig.png",
    dir: "/home/geon/pgn/shortcuts",
    partial: "fig.png",
  })
})

test("absolute input ignores the base", () => {
  assert.equal(
    resolveJumpInput("/home/geon/LabNotes/a.md", BASE)?.path,
    "/home/geon/LabNotes/a.md",
  )
})

test("trailing slash lists the directory itself", () => {
  assert.deepEqual(resolveJumpInput("studies/", BASE), {
    path: "/home/geon/pgn/studies",
    dir: "/home/geon/pgn/studies",
    partial: "",
  })
  assert.equal(resolveJumpInput("studies/..", BASE)?.partial, "")
})

test("empty base resolves against root", () => {
  assert.equal(resolveJumpInput("a/b", "")?.path, "/a/b")
})

test("quotes, URLs and file:// are unwrapped", () => {
  assert.equal(resolveJumpInput("'a b/c.pdf'", BASE)?.path, `${BASE}/a b/c.pdf`)
  assert.equal(
    resolveJumpInput("https://host.ts.net:5244/x/%ED%95%9C.md", BASE)?.path,
    "/x/한.md",
  )
  assert.equal(resolveJumpInput("file:///tmp/a.png", BASE)?.path, "/tmp/a.png")
  assert.equal(resolveJumpInput("   ", BASE), null)
})

test("display is relative inside the base, absolute outside", () => {
  assert.equal(displayJumpPath(`${BASE}/goal.md`, BASE), "goal.md")
  assert.equal(displayJumpPath(BASE, BASE), "./")
  assert.equal(displayJumpPath("/home/geon/pgnx/a", BASE), "/home/geon/pgnx/a")
  assert.equal(displayJumpPath("/a/b", "/"), "a/b")
})

test("entries rank exact, prefix, substring, subsequence; dirs first on ties", () => {
  const entries = [
    { name: "results.png", is_dir: false },
    { name: "res", is_dir: false },
    { name: "results", is_dir: true },
    { name: "my_res.md", is_dir: false },
    { name: "r_e_s.txt", is_dir: false },
    { name: "zzz", is_dir: false },
  ]
  assert.deepEqual(
    rankJumpEntries(entries, "res", 10).map((e) => e.name),
    ["res", "results", "results.png", "my_res.md", "r_e_s.txt"],
  )
  assert.deepEqual(
    rankJumpEntries(entries, "", 2).map((e) => e.name),
    ["results", "my_res.md"],
  )
})

test("numeric names sort naturally", () => {
  const entries = ["it10", "it9", "it100"].map((name) => ({
    name,
    is_dir: false,
  }))
  assert.deepEqual(
    rankJumpEntries(entries, "it", 10).map((e) => e.name),
    ["it9", "it10", "it100"],
  )
})

test("history keeps order and needs every token", () => {
  const items = [
    { path: "/pgn/studies/merge/fig.png" },
    { path: "/pgn/goal.md" },
    { path: "/LabNotes/Merge-notes.pdf" },
  ]
  assert.deepEqual(
    filterJumpHistory(items, "merge", 10).map((i) => i.path),
    ["/pgn/studies/merge/fig.png", "/LabNotes/Merge-notes.pdf"],
  )
  assert.deepEqual(
    filterJumpHistory(items, "MERGE pdf", 10).map((i) => i.path),
    ["/LabNotes/Merge-notes.pdf"],
  )
  assert.equal(filterJumpHistory(items, "", 2).length, 2)
})
