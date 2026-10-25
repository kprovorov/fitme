import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useExercises } from "~/hooks/queries/library";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

// The real module, not the fake every other test file reads.
jest.unmock("~/lib/library");

const client = createTestQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const fetch = jest.fn<typeof globalThis.fetch>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  // Only the old name is set: the app must not read it.
  process.env.EXPO_PUBLIC_EXERCISES_URL = "https://exercises.test";
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_LIBRARY_URL");
  globalThis.fetch = fetch;
});

afterEach(() => {
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_EXERCISES_URL");
  globalThis.fetch = realFetch;
});

it("shows every Exercise under its slug's name, with no request, while EXPO_PUBLIC_LIBRARY_URL is unset", async () => {
  const { result } = await renderHook(
    () => useExercises(["barbell-back-squat"]),
    { wrapper }
  );
  await settle(client);

  expect(result.current["barbell-back-squat"]).toMatchObject({
    isResolved: false,
    name: "Barbell back squat",
    thumbnail_url: null,
  });
  expect(fetch).not.toHaveBeenCalled();
});
