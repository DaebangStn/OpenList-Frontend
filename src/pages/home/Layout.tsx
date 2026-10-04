import { createEffect, onCleanup, onMount } from "solid-js"
import { Markdown } from "~/components"
import { useRouter, useTitle } from "~/hooks"
import { getSetting } from "~/store"
import { notify, trimBase } from "~/utils"
import { isMac } from "~/utils/compatibility"
import { isEmbedded, postToShell, shellCommandForKey } from "~/utils/embed"
import { Body } from "./Body"
import { Footer } from "./Footer"
import { Header } from "./header/Header"
import { PathJump, useRecordViewHistory } from "./PathJump"
import { Toolbar } from "./toolbar/Toolbar"

/** Inside a /@tabs frame: report the location and pass shortcuts and
 * Ctrl/middle clicks on links up to the shell. */
const useShellBridge = () => {
  const { pathname } = useRouter()
  createEffect(() =>
    postToShell({ type: "openlist:location", path: pathname() }),
  )
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || (isMac && e.metaKey)) && e.key.toLowerCase() === "p") {
      e.preventDefault()
      postToShell({ type: "openlist:command", command: "palette-new" })
      return
    }
    const command = shellCommandForKey(e)
    if (command) {
      e.preventDefault()
      postToShell({ type: "openlist:command", command })
    }
  }
  const onClick = (e: MouseEvent) => {
    if (!(e.ctrlKey || e.metaKey || e.button === 1)) return
    const a = (e.target as Element | null)?.closest?.("a[href]")
    if (!a) return
    const url = new URL((a as HTMLAnchorElement).href, location.href)
    if (url.origin !== location.origin || url.pathname.includes("/@")) return
    e.preventDefault()
    e.stopPropagation()
    postToShell({
      type: "openlist:open",
      path: trimBase(decodeURIComponent(url.pathname)),
    })
  }
  document.addEventListener("keydown", onKey)
  document.addEventListener("click", onClick, true)
  document.addEventListener("auxclick", onClick, true)
  onCleanup(() => {
    document.removeEventListener("keydown", onKey)
    document.removeEventListener("click", onClick, true)
    document.removeEventListener("auxclick", onClick, true)
  })
}

const Index = () => {
  useTitle(getSetting("site_title"))
  useRecordViewHistory()
  if (isEmbedded) {
    useShellBridge()
    return (
      <>
        <Toolbar />
        <Body />
      </>
    )
  }
  // The tab shell is the start page; the plain view stays reachable at any
  // other path.
  const { pathname, to } = useRouter()
  onMount(() => {
    if (pathname() === "/") to("/@tabs", false, { replace: true })
  })
  const announcement = getSetting("announcement")
  if (announcement) {
    notify.render(<Markdown children={announcement} />)
  }
  return (
    <>
      <Header />
      <Toolbar />
      <Body />
      <Footer />
      <PathJump />
    </>
  )
}

export default Index
