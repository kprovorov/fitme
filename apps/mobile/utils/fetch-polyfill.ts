// This MUST be first to ensure that `fetch` is defined in the React Native environment.
import "react-native/Libraries/Core/InitializeCore";
// Ensure fetch is installed before adding our fetch polyfill to ensure Headers and Request are available globally.
import "whatwg-fetch";
// This MUST be imported to ensure URL is installed.
import "expo";

import { fetch } from "expo/fetch";
// This file configures the runtime environment to increase compatibility with WinterCG.
// https://wintercg.org/
import Constants from "expo-constants";

declare const __DEV__: boolean;

interface ExpoExtraRouterConfig {
  router?: {
    origin?: string | boolean | null;
    generatedOrigin?: string | null;
  };
}

const manifest = Constants.expoConfig;

const polyfillSymbol = Symbol.for("expo.polyfillFetchWithWindowLocation");

// Accepts any fetch-like implementation (e.g. `expo/fetch`, whose parameter and
// response types differ from the DOM `fetch`); arguments are forwarded untouched.
// biome-ignore lint/suspicious/noExplicitAny: parameters must be `any` so fetch implementations with narrower signatures are assignable
type WrappableFetch = ((...args: any[]) => Promise<unknown>) & {
  [polyfillSymbol]?: boolean;
};

export function wrapFetchWithWindowLocation(fetchImpl: WrappableFetch) {
  if (fetchImpl[polyfillSymbol]) {
    return fetchImpl;
  }

  // biome-ignore lint/suspicious/noExplicitAny: forwards arbitrary fetch args to the native implementation
  const _fetch = (...props: any[]) => {
    if (props[0] && typeof props[0] === "string" && props[0].startsWith("/")) {
      props[0] = new URL(props[0], getOrigin()).toString();
    } else if (
      props[0] &&
      typeof props[0] === "object" &&
      props[0].url &&
      typeof props[0].url === "string" &&
      props[0].url.startsWith("/")
    ) {
      props[0].url = new URL(props[0].url, getOrigin()).toString();
    }

    return fetchImpl(...props);
  };

  _fetch[polyfillSymbol] = true;

  return _fetch;
}

const extra = manifest?.extra as ExpoExtraRouterConfig | null;

function getOrigin() {
  assertOrigin();
  return window.location?.origin;
}

function assertOrigin() {
  // We use the dev server in development but should attempt to warn early if the origin will be disabled in production.
  if (extra?.router?.origin === false) {
    throw new Error(
      "The server origin cannot be false in the app.json. Setup server deployments to ensure production fetch requests work https://docs.expo.dev/router/reference/api-routes/#native-deployment"
    );
  }
  if (typeof window !== "undefined" && !window.location) {
    throw new Error(
      "window.location is not defined. Setup server deployments to ensure relative fetch requests work in production https://docs.expo.dev/router/reference/api-routes/#native-deployment"
    );
  }
}

// Defer the assertion in release builds so the app doesn't crash instantly.
if (__DEV__) {
  assertOrigin();
}

// Polyfill window.location in native runtimes.
if (typeof window !== "undefined") {
  // Polyfill native fetch to support relative URLs
  Object.defineProperty(globalThis, "fetch", {
    value: wrapFetchWithWindowLocation(fetch),
  });
}
