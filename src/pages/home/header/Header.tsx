import {
  HStack,
  useColorModeValue,
  Image,
  Center,
  Icon,
  Kbd,
  CenterProps,
} from "@hope-ui/solid"
import { changeColor } from "seemly"
import { Show, createMemo } from "solid-js"
import { getMainColor, getSetting, local, objStore, State } from "~/store"
import { BsClockHistory, BsSearch } from "solid-icons/bs"
import { CenterLoading } from "~/components"
import { Container } from "../Container"
import { bus } from "~/utils"
import { Layout } from "./layout"
import { isMac } from "~/utils/compatibility"
import { useRouter, useT } from "~/hooks"

export const Header = () => {
  const t = useT()
  const { isShare } = useRouter()
  const logos = getSetting("logo").split("\n")
  const logo = useColorModeValue(logos[0], logos.pop())

  const stickyProps = createMemo<CenterProps>(() => {
    switch (local["position_of_header_navbar"]) {
      case "sticky":
        return { position: "sticky", zIndex: "$sticky", top: 0 }
      default:
        return { position: undefined, zIndex: undefined, top: undefined }
    }
  })

  return (
    <Center
      {...stickyProps}
      bgColor="$background"
      class="header"
      w="$full"
      // shadow="$md"
    >
      <Container>
        <HStack
          px="calc(2% + 0.5rem)"
          py="$2"
          w="$full"
          justifyContent="space-between"
        >
          <HStack class="header-left" h="44px">
            <Image
              src={logo()!}
              h="$full"
              w="auto"
              fallback={<CenterLoading />}
            />
          </HStack>
          <HStack class="header-right" spacing="$2">
            <Show when={!isShare()}>
              <HStack
                p="$1"
                px="$2"
                spacing="$2"
                rounded="$md"
                cursor="pointer"
                title={t("home.path_jump.open")}
                color={getMainColor()}
                bgColor={changeColor(getMainColor(), { alpha: 0.15 })}
                _hover={{
                  bgColor: changeColor(getMainColor(), { alpha: 0.2 }),
                }}
                onClick={() => {
                  bus.emit("tool", "path_jump")
                }}
              >
                <Icon as={BsClockHistory} />
                <HStack display={{ "@initial": "none", "@md": "flex" }}>
                  {isMac ? <Kbd>Cmd</Kbd> : <Kbd>Ctrl</Kbd>}
                  <Kbd>P</Kbd>
                </HStack>
              </HStack>
            </Show>
            <Show when={objStore.state === State.Folder}>
              <Show when={getSetting("search_index") !== "none"}>
                <HStack
                  bg="$neutral4"
                  w="$32"
                  p="$1"
                  rounded="$md"
                  justifyContent="space-between"
                  border="2px solid transparent"
                  cursor="pointer"
                  color={getMainColor()}
                  bgColor={changeColor(getMainColor(), { alpha: 0.15 })}
                  _hover={{
                    bgColor: changeColor(getMainColor(), { alpha: 0.2 }),
                  }}
                  onClick={() => {
                    bus.emit("tool", "search")
                  }}
                >
                  <Icon as={BsSearch} />
                  <HStack>
                    {isMac ? <Kbd>Cmd</Kbd> : <Kbd>Ctrl</Kbd>}
                    <Kbd>K</Kbd>
                  </HStack>
                </HStack>
              </Show>
              <Layout />
            </Show>
          </HStack>
        </HStack>
      </Container>
    </Center>
  )
}
