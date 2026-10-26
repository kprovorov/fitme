/**
 * The model picker's hook on the seam the screens use: `useSelectedArnoldModel`
 * over the real query, the fake Public API and MMKV.
 */
import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { storage } from "~/lib/mmkv";
import {
  FAKE_PUBLIC_API_URL,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { useSelectedArnoldModel } from "../arnold-model";

const HAIKU = "anthropic/claude-haiku-4.5";

const { EXPO_PUBLIC_API_URL } = process.env;

const renderSelectedModel = async () => {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = await renderHook(() => useSelectedArnoldModel(), {
    wrapper,
  });
  await settle(client);
  return rendered;
};

beforeEach(() => {
  storage.clearAll();
  process.env.EXPO_PUBLIC_API_URL = FAKE_PUBLIC_API_URL;
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = EXPO_PUBLIC_API_URL;
});

describe("useSelectedArnoldModel", () => {
  it("reads the list from GET /v1/arnold/models and caches it under arnold.models", async () => {
    const { result } = await renderSelectedModel();

    expect(fakePublicApi.count("GET /v1/arnold/models")).toBe(1);
    expect(result.current.models?.map(({ id }) => id)).toEqual(
      arnoldModels.map(({ id }) => id)
    );
    expect(result.current.model?.id).toBe(defaultArnoldModelId);
    expect(JSON.parse(storage.getString("arnold.models") ?? "").defaultId).toBe(
      defaultArnoldModelId
    );
  });

  it("saves the pick under arnold.model", async () => {
    const { result } = await renderSelectedModel();

    await act(() => {
      result.current.setSelectedId(HAIKU);
    });

    expect(storage.getString("arnold.model")).toBe(HAIKU);
    expect(result.current.model?.id).toBe(HAIKU);
  });
});
