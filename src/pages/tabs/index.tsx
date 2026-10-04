import { Box, HStack, Icon, Kbd, Text, useColorMode } from "@hope-ui/solid"
import {
  createDockview,
  DockviewApi,
  GroupPanelPartInitParameters,
  IContentRenderer,
  IDockviewPanel,
  IWatermarkRenderer,
  themeDark,
  themeLight,
} from "dockview-core"
import {
  BsBoxArrowUpRight,
  BsClockHistory,
  BsLayoutSplit,
} from "solid-icons/bs"
import { createEffect, onCleanup, onMount } from "solid-js"
import { useRouter, useTitle } from "~/hooks"
import { PathJump } from "~/pages/home/PathJump"
import { getMainColor, getSetting } from "~/store"
import { bus, encodePath, joinBase, pathBase } from "~/utils"
import { isMac } from "~/utils/compatibility"
import { isShellMessage } from "~/utils/embed"
import "./dockview.css"

// Each tab is an iframe of the normal UI (see utils/embed.ts), so tabs keep
// their own state; dockview supplies tabs, splits, drag, resize and the
// serialisable layout, which is kept per browser.

const LAYOUT_KEY = "openlist.tabs.layout"
const BAR_HEIGHT = 36

type TabParams = { path: string }

const titleOf = (path: string) => pathBase(path) || "/"

class FrameRenderer implements IContentRenderer {
  readonly element = document.createElement("div")
  readonly frame = document.createElement("iframe")
  path = ""
  panelId = ""

  constructor(private readonly frames: Map<string, FrameRenderer>) {
    this.element.style.cssText = "width:100%;height:100%"
    this.frame.style.cssText = "width:100%;height:100%;border:0;display:block"
    this.element.appendChild(this.frame)
  }

  init(p: GroupPanelPartInitParameters) {
    this.panelId = p.api.id
    this.frames.set(this.panelId, this)
    this.navigate((p.params as TabParams).path)
  }

  navigate(path: string) {
    if (path === this.path) return
    this.path = path
    this.frame.src = joinBase(encodePath(path, true))
  }

  dispose() {
    this.frames.delete(this.panelId)
  }
}

const Tabs = () => {
  useTitle(() => `Tabs | ${getSetting("site_title")}`)
  const { searchParams } = useRouter()
  const { colorMode } = useColorMode()
  const frames = new Map<string, FrameRenderer>()
  let host!: HTMLDivElement
  let api: DockviewApi | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let nextId = Date.now()

  const save = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        if (api) localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
      } catch {}
    }, 300)
  }

  const frameOf = (panel?: IDockviewPanel) =>
    panel ? frames.get(panel.id) : undefined

  /** VSCode-like: open in a new tab (or focus the tab already showing it);
   * `replace` reuses the active tab instead. */
  const open = (path: string, replace = false) => {
    if (!api) return
    const active = api.activePanel
    if (replace && active) {
      frameOf(active)?.navigate(path)
      active.api.updateParameters({ path })
      active.api.setTitle(titleOf(path))
      save()
      return
    }
    const existing = api.panels.find(
      (p) => (p.params as TabParams | undefined)?.path === path,
    )
    if (existing) {
      existing.api.setActive()
      return
    }
    api.addPanel<TabParams>({
      id: `tab-${nextId++}`,
      component: "frame",
      title: titleOf(path),
      params: { path },
      position: active
        ? { referencePanel: active, direction: "within" }
        : undefined,
    })
  }

  const split = () => {
    const active = api?.activePanel
    if (!api || !active) return
    const path = (active.params as TabParams).path
    api.addPanel<TabParams>({
      id: `tab-${nextId++}`,
      component: "frame",
      title: titleOf(path),
      params: { path },
      position: { referencePanel: active, direction: "right" },
    })
  }

  const popOut = () => {
    const path = (api?.activePanel?.params as TabParams | undefined)?.path
    window.open(joinBase(encodePath(path ?? "/", true)), "_blank")
  }

  const onMessage = (e: MessageEvent) => {
    if (e.origin !== location.origin || !isShellMessage(e.data) || !api) return
    const from = [...frames.values()].find(
      (f) => f.frame.contentWindow === e.source,
    )
    const msg = e.data
    switch (msg.type) {
      case "openlist:location": {
        const panel = from && api.getPanel(from.panelId)
        if (!from || !panel) return
        from.path = msg.path
        panel.api.updateParameters({ path: msg.path })
        panel.api.setTitle(titleOf(msg.path))
        save()
        return
      }
      case "openlist:open":
        return open(msg.path)
      case "openlist:command":
        if (msg.command === "palette") bus.emit("tool", "path_jump")
        else api.activePanel?.api.close()
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.key.toLowerCase() === "w") {
      e.preventDefault()
      api?.activePanel?.api.close()
    }
  }

  onMount(() => {
    api = createDockview(host, {
      theme: colorMode() === "dark" ? themeDark : themeLight,
      defaultRenderer: "always",
      createComponent: () => new FrameRenderer(frames),
      createWatermarkComponent: (): IWatermarkRenderer => {
        const element = document.createElement("div")
        element.style.cssText =
          "display:flex;height:100%;align-items:center;justify-content:center;opacity:.6"
        element.textContent = `${isMac ? "Cmd" : "Ctrl"}+P to open a file`
        return { element, init: () => {} }
      },
    })
    try {
      const saved = localStorage.getItem(LAYOUT_KEY)
      if (saved) api.fromJSON(JSON.parse(saved))
    } catch {
      api.clear()
    }
    const initial = searchParams["open"]
    if (initial) open(initial)
    else if (api.panels.length === 0) open(getSetting("path_jump_base") || "/")
    api.onDidLayoutChange(save)
    window.addEventListener("message", onMessage)
    document.addEventListener("keydown", onKey)
  })

  createEffect(() => {
    api?.updateOptions({
      theme: colorMode() === "dark" ? themeDark : themeLight,
    })
  })

  onCleanup(() => {
    window.removeEventListener("message", onMessage)
    document.removeEventListener("keydown", onKey)
    clearTimeout(saveTimer)
    api?.dispose()
  })

  const BarButton = (p: {
    icon: typeof BsClockHistory
    label: string
    onClick: () => void
    kbd?: string
  }) => (
    <HStack
      as="button"
      spacing="$1"
      px="$2"
      h="26px"
      rounded="$md"
      color={getMainColor()}
      _hover={{ bgColor: "$neutral4" }}
      title={p.label}
      onClick={p.onClick}
    >
      <Icon as={p.icon} />
      <Text size="sm" display={{ "@initial": "none", "@md": "block" }}>
        {p.label}
      </Text>
      {p.kbd && (
        <Kbd display={{ "@initial": "none", "@md": "inline-block" }}>
          {p.kbd}
        </Kbd>
      )}
    </HStack>
  )

  return (
    <Box h="100vh" w="100vw" overflow="hidden" bgColor="$background">
      <HStack h={`${BAR_HEIGHT}px`} px="$2" spacing="$2">
        <BarButton
          icon={BsClockHistory}
          label="Open"
          kbd={`${isMac ? "Cmd" : "Ctrl"} P`}
          onClick={() => bus.emit("tool", "path_jump")}
        />
        <BarButton icon={BsLayoutSplit} label="Split right" onClick={split} />
        <BarButton
          icon={BsBoxArrowUpRight}
          label="Open in browser tab"
          onClick={popOut}
        />
      </HStack>
      <div ref={host} style={{ height: `calc(100vh - ${BAR_HEIGHT}px)` }} />
      <PathJump onOpen={(path, alt) => open(path, alt)} />
    </Box>
  )
}

export default Tabs
