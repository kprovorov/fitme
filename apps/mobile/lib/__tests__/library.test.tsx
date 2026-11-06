import * as Jest from "@jest/globals";
import { jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type * as LibraryHooks from "~/hooks/queries/library";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

// The real module, not the fake every other test file reads. An
// unconfigured Library never asks Clerk for a token.
jest.unmock("~/lib/library");

const RealBroadcastChannel = globalThis.BroadcastChannel;
const channels = new Set<BroadcastChannel>();

Jest.beforeAll(() => {
  // Keep Clerk's real channel behavior and release its import-time resources.
  globalThis.BroadcastChannel = class extends RealBroadcastChannel {
    constructor(name: string) {
      super(name);
      channels.add(this);
    }
  };
});

Jest.afterAll(() => {
  globalThis.BroadcastChannel = RealBroadcastChannel;

  for (const channel of channels) {
    channel.close();
  }
});

const client = createTestQueryClient();

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const fetch = jest.fn<typeof globalThis.fetch>();
const realFetch = globalThis.fetch;

Jest.beforeEach(() => {
  // Only the old name is set: the app must not read it.
  process.env.EXPO_PUBLIC_EXERCISES_URL = "https://exercises.test";
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_LIBRARY_URL");
  globalThis.fetch = fetch;
});

Jest.afterEach(() => {
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_EXERCISES_URL");
  globalThis.fetch = realFetch;
});

Jest.test(
  "shows every Exercise under its slug's name, with no request, while EXPO_PUBLIC_LIBRARY_URL is unset",
  async () => {
    const { useExercises } = jest.requireActual<typeof LibraryHooks>(
      "~/hooks/queries/library"
    );

    const { result } = await renderHook(
      () => useExercises(["barbell-back-squat"]),
      { wrapper }
    );

    await settle(client);

    Jest.expect(result.current["barbell-back-squat"]).toMatchObject({
      isResolved: false,
      name: "Barbell back squat",
      thumbnail_url: null,
    });
    Jest.expect(fetch).not.toHaveBeenCalled();
  }
);
