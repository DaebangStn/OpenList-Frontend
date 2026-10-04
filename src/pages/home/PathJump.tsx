import {
  Button,
  createDisclosure,
  HStack,
  Icon,
  IconButton,
  Input,
  Kbd,
  Modal,
  ModalBody,
  ModalContent,
  ModalOverlay,
  Text,
  VStack,
} from "@hope-ui/solid"
import { BsX } from "solid-icons/bs"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { useRouter, useT } from "~/hooks"
import { getMainColor, getSetting, objStore, password, State } from "~/store"
import { ObjType, ViewHistoryItem } from "~/types"
import {
  bus,
  encodePath,
  ext,
  fsHistory,
  fsHistoryAdd,
  fsFind,
  fsHistoryDelete,
  fsList,
  hoverColor,
  pathBase,
} from "~/utils"
import { isMac } from "~/utils/compatibility"
import { getIconByTypeAndName } from "~/utils/icon"
import {
  displayJumpPath,
  filterJumpHistory,
  rankJumpEntries,
  resolveJumpInput,
} from "~/utils/path_jump"

interface Row {
  path: string
  is_dir: boolean
  type: ObjType
  history?: ViewHistoryItem
}

const extTypes: [ObjType, string[]][] = [
  [ObjType.VIDEO, ["mp4", "mkv", "webm", "mov", "avi", "m4v"]],
  [ObjType.IMAGE, ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]],
  [ObjType.AUDIO, ["mp3", "flac", "ogg", "m4a", "wav", "opus"]],
  [ObjType.TEXT, ["txt", "md", "json", "yaml", "yml", "py", "ts", "log"]],
]

// History rows only carry a path, so guess the icon from the extension.
const typeOfName = (name: string): ObjType => {
  const e = ext(name).toLowerCase()
  return extTypes.find(([, exts]) => exts.includes(e))?.[0] ?? ObjType.UNKNOWN
}

const joinPath = (dir: string, name: string) =>
  dir === "/" ? `/${name}` : `${dir}/${name}`

const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/"

const timeAgo = (iso: string) => {
  const secs = (Date.parse(iso) - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit)
  }
  return rtf.format(0, "second")
}

/** Records every file the web UI shows into the server-side history. */
export const useRecordViewHistory = () => {
  const { pathname, isShare } = useRouter()
  let recorded = ""
  createEffect(
    on([() => objStore.state, () => objStore.obj], ([state]) => {
      if (state !== State.File) {
        recorded = ""
        return
      }
      const path = pathname()
      if (isShare() || path === recorded) return
      recorded = path
      fsHistoryAdd(path).catch(() => {})
    }),
  )
}

/**
 * Ctrl+P palette: type a path relative to the `path_jump_base` setting (or
 * an absolute one) with directory completion, or pick a recently opened file.
 */
export const PathJump = (props: {
  /** Replaces navigation, e.g. the tab shell opening a tab. `alt` is true
   * for Alt+Enter. */
  onOpen?: (path: string, alt: boolean) => void
}) => {
  const t = useT()
  const { to, isShare } = useRouter()
  const { isOpen, onOpen, onClose } = createDisclosure()
  const [input, setInput] = createSignal("")
  const [history, setHistory] = createSignal<ViewHistoryItem[]>([])
  const [listing, setListing] = createSignal<{ dir: string; rows: Row[] }>()
  const [selected, setSelected] = createSignal(0)
  // Enter on "dir/" opens dir itself until the user picks a row explicitly.
  const [picked, setPicked] = createSignal(false)
  const listings = new Map<string, Row[]>()
  const base = () => getSetting("path_jump_base") || "/"

  const loadHistory = async () => {
    const resp = await fsHistory(200)
    if (resp.code === 200) setHistory(resp.data ?? [])
  }

  // A touch screen opening from the header button wants the recent list,
  // not an on-screen keyboard covering it.
  const [focusInput, setFocusInput] = createSignal(true)
  const open = (fromKeyboard = false) => {
    if (isShare()) return
    setFocusInput(
      fromKeyboard || !window.matchMedia("(pointer: coarse)").matches,
    )
    listings.clear()
    setInput("")
    setListing(undefined)
    loadHistory()
    onOpen()
  }
  const handler = (name: string) => {
    if (name === "path_jump") open()
  }
  bus.on("tool", handler)
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || (isMac && e.metaKey)) && e.key.toLowerCase() === "p") {
      if (isShare()) return
      e.preventDefault()
      isOpen() ? onClose() : open(true)
    }
  }
  document.addEventListener("keydown", onKey)
  onCleanup(() => {
    bus.off("tool", handler)
    document.removeEventListener("keydown", onKey)
  })

  const target = createMemo(() => resolveJumpInput(input(), base()))

  let timer: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(target, (tg) => {
      clearTimeout(timer)
      if (!tg) return
      const cached = listings.get(tg.dir)
      if (cached) {
        setListing({ dir: tg.dir, rows: cached })
        return
      }
      const dir = tg.dir
      timer = setTimeout(async () => {
        const resp = await fsList(dir, password())
        const rows: Row[] =
          resp.code === 200
            ? (resp.data.content ?? []).map((o) => ({
                path: joinPath(dir, o.name),
                is_dir: o.is_dir,
                type: o.type,
              }))
            : []
        listings.set(dir, rows)
        if (target()?.dir === dir) setListing({ dir, rows })
      }, 120)
    }),
  )
  onCleanup(() => clearTimeout(timer))

  // Whole-tree matches for any fragment of a path ("park" finds
  // paper/.../park2025magnet.pdf), from the server's path index.
  const [found, setFound] = createSignal<Row[]>([])
  let findTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(input, (q) => {
      clearTimeout(findTimer)
      const query = q.trim()
      if (query.length < 2) {
        setFound([])
        return
      }
      findTimer = setTimeout(async () => {
        const resp = await fsFind(query, 50)
        if (input().trim() !== query) return
        setFound(
          resp.code === 200
            ? (resp.data ?? []).map((f) => ({
                path: f.path,
                is_dir: f.is_dir,
                type: f.is_dir ? ObjType.FOLDER : typeOfName(f.path),
              }))
            : [],
        )
      }, 150)
    }),
  )
  onCleanup(() => clearTimeout(findTimer))

  const historyRow = (h: ViewHistoryItem): Row => ({
    path: h.path,
    is_dir: false,
    type: typeOfName(h.path),
    history: h,
  })

  const rows = createMemo<Row[]>(() => {
    const tg = target()
    if (!tg) return history().map(historyRow)
    const out: Row[] = []
    const l = listing()
    if (l && l.dir === tg.dir) {
      const named = l.rows.map((r) => ({ ...r, name: pathBase(r.path) ?? "" }))
      out.push(...rankJumpEntries(named, tg.partial, 50))
    }
    const seen = new Set(out.map((r) => r.path))
    for (const h of filterJumpHistory(history(), input(), 20)) {
      if (!seen.has(h.path)) {
        seen.add(h.path)
        out.push(historyRow(h))
      }
    }
    for (const f of found()) {
      if (!seen.has(f.path)) out.push(f)
    }
    return out
  })
  createEffect(
    on(rows, () => {
      setSelected(0)
      setPicked(false)
    }),
  )

  const go = (path: string, alt = false) => {
    onClose()
    if (props.onOpen) props.onOpen(path, alt)
    else to(encodePath(path, true))
  }
  const complete = (row: Row) => {
    setInput(displayJumpPath(row.path, base()) + (row.is_dir ? "/" : ""))
  }
  const remove = async (path: string) => {
    await fsHistoryDelete(path)
    setHistory((h) => h.filter((it) => it.path !== path))
  }
  const clearAll = async () => {
    if (!confirm(t("home.path_jump.clear_confirm"))) return
    await fsHistoryDelete()
    setHistory([])
  }

  const onInputKey = (e: KeyboardEvent) => {
    const list = rows()
    const move = (d: number) => {
      e.preventDefault()
      if (!list.length) return
      setSelected((selected() + d + list.length) % list.length)
      setPicked(true)
    }
    switch (e.key) {
      case "ArrowDown":
        return move(1)
      case "ArrowUp":
        return move(-1)
      case "Tab": {
        e.preventDefault()
        const row = list[selected()]
        if (row) complete(row)
        return
      }
      case "Escape":
        e.preventDefault()
        return onClose()
      case "Enter": {
        e.preventDefault()
        const tg = target()
        const row = list[selected()]
        const literal = e.ctrlKey || e.metaKey || e.shiftKey
        if (tg && (literal || (tg.partial === "" && !picked()) || !row)) {
          return go(tg.path, e.altKey)
        }
        if (row) go(row.path, e.altKey)
      }
    }
  }

  return (
    <Modal
      opened={isOpen()}
      onClose={onClose}
      size={{ "@initial": "sm", "@sm": "lg", "@md": "2xl" }}
      initialFocus={focusInput() ? "#path-jump-input" : "#path-jump-close"}
      scrollBehavior="inside"
      closeOnEsc={false}
    >
      <ModalOverlay bg="$blackAlpha5" />
      <ModalContent mx="$2" mt={{ "@initial": "$2", "@md": "10vh" }}>
        <ModalBody p="$2">
          <VStack w="$full" spacing="$2" alignItems="stretch">
            <HStack spacing="$2">
              <Input
                id="path-jump-input"
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                placeholder={t("home.path_jump.placeholder", {
                  base: base(),
                })}
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={onInputKey}
              />
              <IconButton
                id="path-jump-close"
                aria-label="close"
                variant="ghost"
                icon={<BsX />}
                onClick={onClose}
              />
            </HStack>
            <Show when={!target()}>
              <HStack justifyContent="space-between" px="$1">
                <Text size="sm" color="$neutral11" fontWeight="$semibold">
                  {t("home.path_jump.recent")}
                </Text>
                <Show when={history().length > 0}>
                  <Button size="xs" variant="ghost" onClick={clearAll}>
                    {t("home.path_jump.clear")}
                  </Button>
                </Show>
              </HStack>
            </Show>
            <Show
              when={rows().length > 0}
              fallback={
                <Text size="sm" color="$neutral10" p="$2">
                  {target()
                    ? t("home.path_jump.no_match")
                    : t("home.path_jump.empty")}
                </Text>
              }
            >
              <VStack alignItems="stretch" spacing="$0_5">
                <For each={rows()}>
                  {(row, i) => (
                    <HStack
                      px="$2"
                      py="$1"
                      rounded="$md"
                      cursor="pointer"
                      spacing="$2"
                      bgColor={i() === selected() ? hoverColor() : undefined}
                      onMouseMove={() => {
                        if (i() !== selected()) {
                          setSelected(i())
                          setPicked(true)
                        }
                      }}
                      onClick={() => go(row.path)}
                    >
                      <Icon
                        boxSize="$5"
                        flexShrink={0}
                        color={getMainColor()}
                        as={getIconByTypeAndName(
                          row.is_dir ? ObjType.FOLDER : row.type,
                          row.path,
                        )}
                      />
                      <VStack flex={1} minW={0} spacing="$0" alignItems="start">
                        <Text
                          size="sm"
                          fontWeight="$medium"
                          css={{ wordBreak: "break-all" }}
                        >
                          {pathBase(row.path)}
                          {row.is_dir ? "/" : ""}
                        </Text>
                        <Text
                          size="xs"
                          color="$neutral10"
                          css={{ wordBreak: "break-all" }}
                        >
                          {displayJumpPath(parentPath(row.path), base())}
                        </Text>
                      </VStack>
                      <Show when={row.history}>
                        {(h) => (
                          <>
                            <Text
                              size="xs"
                              color="$neutral10"
                              flexShrink={0}
                              title={new Date(h().viewed_at).toLocaleString()}
                            >
                              {timeAgo(h().viewed_at)}
                            </Text>
                            <IconButton
                              aria-label={t("home.path_jump.remove")}
                              size="xs"
                              variant="ghost"
                              icon={<BsX />}
                              onClick={(e: MouseEvent) => {
                                e.stopPropagation()
                                remove(row.path)
                              }}
                            />
                          </>
                        )}
                      </Show>
                    </HStack>
                  )}
                </For>
              </VStack>
            </Show>
            <HStack
              display={{ "@initial": "none", "@md": "flex" }}
              spacing="$3"
              px="$1"
              color="$neutral10"
              fontSize="$xs"
              flexWrap="wrap"
            >
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("home.path_jump.key_select")}
              </span>
              <span>
                <Kbd>Tab</Kbd> {t("home.path_jump.key_complete")}
              </span>
              <span>
                <Kbd>Enter</Kbd> {t("home.path_jump.key_open")}
              </span>
              <span>
                <Kbd>{isMac ? "Cmd" : "Ctrl"}</Kbd> <Kbd>Enter</Kbd>{" "}
                {t("home.path_jump.key_literal")}
              </span>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
