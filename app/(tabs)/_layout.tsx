import { type Href, usePathname } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Authenticated from "~/components/authenticated";
import { TabBarButton } from "~/components/ui/tab-bar-button";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { BookOpenText } from "~/lib/icons/BookOpenText";
import { ClipboardList } from "~/lib/icons/ClipboardList";
import { Sparkles } from "~/lib/icons/Sparkles";
import { UserRound } from "~/lib/icons/UserRound";

export default function TabLayout() {
  const pathname = usePathname();
  const shouldHideTabs = pathname === "/agent";
  const tabs = [
    {
      name: "home",
      label: "Home",
      href: "/",
      renderIcon: (isFocused: boolean) => (
        <BicepsFlexed
          className={`w-6 h-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "history",
      label: "History",
      href: "/history",
      renderIcon: (isFocused: boolean) => (
        <ClipboardList
          className={`w-6 h-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "agent",
      label: "Agent",
      href: "/agent",
      renderIcon: (isFocused: boolean) => (
        <Sparkles
          className={`w-6 h-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "library",
      label: "Library",
      href: "/library",
      renderIcon: (isFocused: boolean) => (
        <BookOpenText
          className={`w-6 h-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "profile",
      label: "Profile",
      href: "/profile",
      renderIcon: (isFocused: boolean) => (
        <UserRound
          className={`w-6 h-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
  ];

  return (
    <Authenticated>
      <SafeAreaProvider>
        <Tabs>
          <TabSlot />
          <TabList
            className="h-20 px-10 absolute bottom-md left-md right-md bg-black rounded-3xl items-center justify-center border border-white/10 shadow-lg shadow-black/50"
            style={{
              display: shouldHideTabs ? "none" : "flex",
            }}
          >
            {tabs.map((tab) => (
              <TabTrigger
                name={tab.name}
                href={tab.href as Href}
                asChild
                key={tab.name}
              >
                <TabBarButton
                  renderIcon={({ isFocused }) => tab.renderIcon(isFocused)}
                >
                  {tab.label}
                </TabBarButton>
              </TabTrigger>
            ))}
          </TabList>
        </Tabs>
      </SafeAreaProvider>
    </Authenticated>
  );
}
