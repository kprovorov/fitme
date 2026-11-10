/**
 * Stand-ins for expo-router's stack under Jest: the screen a test renders,
 * with the routes it pushes mounted over it (a pushed route the test names
 * in `<PushedRoutes>`; any other push is only recorded), and a header showing
 * each screen's title, its left and right items (a menu as its own button
 * plus each of its items as a `menuitem`), and its search bar
 * (`stack-screen-stub.tsx`'s). Wire it up in the test's mock:
 *
 *   jest.mock("expo-router", () => {
 *     const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
 *       "~/test-utils/router-stub"
 *     );
 *     return {
 *       Stack: { Screen: stub.StackScreenStub },
 *       useLocalSearchParams: () => stub.useStubParams(mockParams.current),
 *       useRouter: () => stub.stubRouter,
 *       …
 *     };
 *   });
 *
 * and call `resetStubRouter()` before each test.
 */
import {
  cloneElement,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactElement, Ref } from "react";
import { Pressable, Text } from "react-native";
import type { SearchBarCommands, SearchBarProps } from "react-native-screens";
import { z } from "zod";

import { SearchBar } from "~/test-utils/stack-screen-stub";

type Params = Record<string, string>;

type Href =
  | string
  | { params?: Record<string, string | undefined>; pathname: string };

const hrefSchema = z.union([
  z.string().transform((pathname) => ({ params: {}, pathname })),
  z.object({
    params: z.record(z.string(), z.string().optional()).default({}),
    pathname: z.string(),
  }),
]);

interface PushedRoute {
  key: number;
  params: Params;
  pathname: string;
}

const listeners = new Set<() => void>();
let routes: PushedRoute[] = [];
let nextKey = 0;
let dismissedTo: string | null = null;

const setRoutes = (next: PushedRoute[]) => {
  routes = next;

  for (const listener of listeners) {
    listener();
  }
};

const toRoute = (href: Href): PushedRoute => {
  const { params: inputParams, pathname } = hrefSchema.parse(href);
  nextKey += 1;

  const params: Params = {};

  for (const [name, value] of Object.entries(inputParams)) {
    if (value !== undefined) {
      params[name] = value;
    }
  }

  return { key: nextKey, params, pathname };
};

/** `useRouter()`'s answer: pushes and pops the routes over the screen. */
export const stubRouter = {
  back: () => setRoutes(routes.slice(0, -1)),
  dismiss: (count = 1) => setRoutes(routes.slice(0, -count)),
  dismissTo: (href: Href) => {
    dismissedTo = hrefSchema.parse(href).pathname;
    setRoutes([]);
  },
  push: (href: Href) => setRoutes([...routes, toRoute(href)]),
  replace: (href: Href) => setRoutes([...routes.slice(0, -1), toRoute(href)]),
};

/** Every route pushed and not popped yet, oldest first. */
export const pushedRoutes = () => routes;

/** The route the last `router.dismissTo` went to, or `null` for none. */
export const dismissedToRoute = () => dismissedTo;

export const resetStubRouter = () => {
  dismissedTo = null;
  setRoutes([]);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/**
 * `<Link asChild href=…>`: the child it wraps, pressing it pushing that
 * route, as the real one does. A route the test names in `<PushedRoutes>`
 * is then mounted over the screen.
 */
export const LinkStub = ({
  children,
  href,
}: {
  asChild?: boolean;
  children: ReactElement<{ onPress?: () => void }>;
  href: Href;
}) => cloneElement(children, { onPress: () => stubRouter.push(href) });

const RouteParams = createContext<Params | null>(null);

/** A pushed route's params, or `base` for the screen the test rendered. */
export const useStubParams = (base: Params) => useContext(RouteParams) ?? base;

/** Mounts each pushed route named in `screens` (by pathname) with its params. */
export const PushedRoutes = ({
  screens,
}: {
  screens: Record<string, ComponentType>;
}) => {
  const pushed = useSyncExternalStore(subscribe, pushedRoutes);

  return pushed.map((route) => {
    const Screen = screens[route.pathname];

    return Screen ? (
      <RouteParams.Provider key={route.key} value={route.params}>
        <Screen />
      </RouteParams.Provider>
    ) : null;
  });
};

interface HeaderItem {
  accessibilityLabel?: string;
  /** A disabled item is rendered disabled, so pressing it does nothing. */
  disabled?: boolean;
  label: string;
  /** A menu item: its own button opens the menu, as the native one does. */
  menu?: { items: HeaderItem[] };
  onPress?: () => void;
}

const HeaderButton = ({
  item,
  role = "button",
}: {
  item: HeaderItem;
  role?: "button" | "menuitem";
}) => {
  const { onPress: handlePress } = item;

  return (
    <Pressable
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      accessibilityRole={role}
      disabled={item.disabled}
      onPress={handlePress}
    />
  );
};

/**
 * A header menu: its own button, named by its label, and each of its items
 * as a `menuitem` named by its label, as the native menu shows them once
 * it's open. A test presses the item it wants.
 */
const HeaderMenu = ({ item }: { item: HeaderItem }) => (
  <>
    <HeaderButton item={{ ...item, onPress: undefined }} />
    {item.menu?.items.map((entry) => (
      <HeaderButton item={entry} key={entry.label} role="menuitem" />
    ))}
  </>
);

const HeaderItems = ({ items }: { items: HeaderItem[] }) =>
  items.map((item) =>
    item.menu ? (
      <HeaderMenu item={item} key={item.label} />
    ) : (
      <HeaderButton item={item} key={item.label} />
    )
  );

/**
 * `<Stack.Screen>`: its title as a header, its left and right items as
 * buttons, and its search bar.
 */
export const StackScreenStub = ({
  options,
}: {
  options?: {
    headerSearchBarOptions?: SearchBarProps & { ref?: Ref<SearchBarCommands> };
    title?: string;
    unstable_headerLeftItems?: () => HeaderItem[];
    unstable_headerRightItems?: () => HeaderItem[];
  };
}) => (
  <>
    <HeaderItems items={options?.unstable_headerLeftItems?.() ?? []} />
    {options?.title ? (
      <Text accessibilityRole="header">{options.title}</Text>
    ) : null}
    <HeaderItems items={options?.unstable_headerRightItems?.() ?? []} />
    {options?.headerSearchBarOptions ? (
      <SearchBar options={options.headerSearchBarOptions} />
    ) : null}
  </>
);
