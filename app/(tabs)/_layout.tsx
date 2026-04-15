import { type Href, usePathname } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
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
          className={`h-6 w-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "history",
      label: "History",
      href: "/history",
      renderIcon: (isFocused: boolean) => (
        <ClipboardList
          className={`h-6 w-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "agent",
      label: "Agent",
      href: "/agent",
      renderIcon: (isFocused: boolean) => (
        <Sparkles
          className={`h-6 w-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "library",
      label: "Library",
      href: "/library",
      renderIcon: (isFocused: boolean) => (
        <BookOpenText
          className={`h-6 w-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
    {
      name: "profile",
      label: "Profile",
      href: "/profile",
      renderIcon: (isFocused: boolean) => (
        <UserRound
          className={`h-6 w-6 ${isFocused ? "text-primary" : "text-white"}`}
        />
      ),
    },
  ];

  return (
    <Authenticated>
      <Tabs>
        <TabSlot />
        <TabList
          className="absolute right-md bottom-md left-md h-20 items-center justify-center rounded-3xl border border-white/10 bg-black px-10 shadow-black/50 shadow-lg"
          style={{
            display: shouldHideTabs ? "none" : "flex",
          }}
        >
          {tabs.map((tab) => (
            <TabTrigger
              asChild
              href={tab.href as Href}
              key={tab.name}
              name={tab.name}
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
    </Authenticated>
  );
}
