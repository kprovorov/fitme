/**
 * Stand-ins for expo-router's stack under Jest: the screen a test renders,
 * with the routes it pushes mounted over it (a pushed route the test names
 * in `<PushedRoutes>`; any other push is only recorded), and a header showing
 * each screen's title, right items and search bar (`stack-screen-stub`'s).
 * Wire it up in the test's mock:
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
  type ComponentType,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import { Pressable, Text } from "react-native";
import type { SearchBarProps } from "react-native-screens";
import { SearchBar } from "~/test-utils/stack-screen-stub";

type Params = Record<string, string>;

type Href =
  | string
  | { params?: Record<string, string | undefined>; pathname: string };

interface PushedRoute {
  key: number;
  params: Params;
  pathname: string;
}

const listeners = new Set<() => void>();
let routes: PushedRoute[] = [];
let nextKey = 0;

const setRoutes = (next: PushedRoute[]) => {
  routes = next;
  for (const listener of listeners) {
    listener();
  }
};

const toRoute = (href: Href): PushedRoute => {
  nextKey += 1;
  if (typeof href === "string") {
    return { key: nextKey, params: {}, pathname: href };
  }
  const params: Params = {};
  for (const [name, value] of Object.entries(href.params ?? {})) {
    if (value !== undefined) {
      params[name] = value;
    }
  }
  return { key: nextKey, params, pathname: href.pathname };
};

/** `useRouter()`'s answer: pushes and pops the routes over the screen. */
export const stubRouter = {
  back: () => setRoutes(routes.slice(0, -1)),
  dismiss: (count = 1) => setRoutes(routes.slice(0, -count)),
  dismissTo: () => setRoutes([]),
  push: (href: Href) => setRoutes([...routes, toRoute(href)]),
  replace: (href: Href) => setRoutes([...routes.slice(0, -1), toRoute(href)]),
};

/** Every route pushed and not popped yet, oldest first. */
export const pushedRoutes = () => routes;

export const resetStubRouter = () => setRoutes([]);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const RouteParams = createContext<Params | null>(null);

/** A pushed route's params, or `base` for the screen the test rendered. */
export const useStubParams = (base: Params) => useContext(RouteParams) ?? base;

/** Mounts each pushed route named in `screens` (by pathname) with its params. */
export function PushedRoutes({
  screens,
}: {
  screens: Record<string, ComponentType>;
}) {
  const pushed = useSyncExternalStore(subscribe, pushedRoutes);
  return pushed.map((route) => {
    const Screen = screens[route.pathname];
    return Screen ? (
      <RouteParams.Provider key={route.key} value={route.params}>
        <Screen />
      </RouteParams.Provider>
    ) : null;
  });
}

interface HeaderItem {
  accessibilityLabel?: string;
  label: string;
  onPress?: () => void;
}

/**
 * `<Stack.Screen>`: its title as a header, its right items as buttons, and
 * its search bar as a text field labelled with its placeholder.
 */
export function StackScreenStub({
  options,
}: {
  options?: {
    headerSearchBarOptions?: SearchBarProps;
    title?: string;
    unstable_headerRightItems?: () => HeaderItem[];
  };
}) {
  return (
    <>
      {options?.title ? (
        <Text accessibilityRole="header">{options.title}</Text>
      ) : null}
      {options?.unstable_headerRightItems?.().map((item) => (
        <Pressable
          accessibilityLabel={item.accessibilityLabel ?? item.label}
          accessibilityRole="button"
          key={item.label}
          onPress={item.onPress}
        />
      ))}
      {options?.headerSearchBarOptions ? (
        <SearchBar options={options.headerSearchBarOptions} />
      ) : null}
    </>
  );
}
