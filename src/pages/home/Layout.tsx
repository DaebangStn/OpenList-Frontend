import { Markdown } from "~/components"
import { useTitle } from "~/hooks"
import { getSetting } from "~/store"
import { notify } from "~/utils"
import { Body } from "./Body"
import { Footer } from "./Footer"
import { Header } from "./header/Header"
import { PathJump, useRecordViewHistory } from "./PathJump"
import { Toolbar } from "./toolbar/Toolbar"

const Index = () => {
  useTitle(getSetting("site_title"))
  useRecordViewHistory()
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
