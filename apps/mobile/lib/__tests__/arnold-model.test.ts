import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  type ArnoldModelList,
  getSelectedArnoldModelId,
  MODELS_KEY,
  readCachedArnoldModels,
  resolveArnoldModel,
  SELECTED_MODEL_KEY,
  writeCachedArnoldModels,
} from "../arnold-model";
import { storage } from "../mmkv";

const list: ArnoldModelList = {
  defaultId: "openai/gpt-5.5",
  models: [
    {
      description: "Fast and capable",
      id: "openai/gpt-5.5",
      label: "GPT-5.5",
    },
    {
      description: "Quick answers",
      id: "anthropic/claude-haiku-4.5",
      label: "Claude Haiku 4.5",
    },
  ],
};

describe("resolveArnoldModel", () => {
  it("keeps a saved pick that is in the list", () => {
    expect(resolveArnoldModel("anthropic/claude-haiku-4.5", list)?.label).toBe(
      "Claude Haiku 4.5"
    );
  });

  it("falls back to the list's default for a pick that isn't in it", () => {
    expect(resolveArnoldModel("gpt-5.5", list)?.id).toBe("openai/gpt-5.5");
    expect(resolveArnoldModel("openai/removed", list)?.id).toBe(
      "openai/gpt-5.5"
    );
  });

  it("uses the default when nothing was picked", () => {
    expect(resolveArnoldModel(undefined, list)?.id).toBe("openai/gpt-5.5");
  });

  it("resolves to no model without a list", () => {
    expect(resolveArnoldModel("openai/gpt-5.5", undefined)).toBeUndefined();
  });
});

describe("arnold.models cache", () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it("reads back the list it wrote", () => {
    writeCachedArnoldModels(list);
    expect(readCachedArnoldModels()).toEqual(list);
  });

  it("has no list before anything is cached", () => {
    expect(readCachedArnoldModels()).toBeUndefined();
  });

  it("writes the list under arnold.models", () => {
    writeCachedArnoldModels(list);
    expect(JSON.parse(storage.getString("arnold.models") ?? "")).toEqual(list);
  });

  it("treats an unreadable value as no list", () => {
    storage.set(MODELS_KEY, "{not json");
    expect(readCachedArnoldModels()).toBeUndefined();
  });

  it("treats a value of another shape as no list", () => {
    storage.set(MODELS_KEY, JSON.stringify({ models: "nope" }));
    expect(readCachedArnoldModels()).toBeUndefined();
    storage.set(MODELS_KEY, JSON.stringify([list]));
    expect(readCachedArnoldModels()).toBeUndefined();
  });

  it("treats a list without models, or whose default isn't in it, as no list", () => {
    storage.set(
      MODELS_KEY,
      JSON.stringify({ defaultId: "openai/gpt-5.5", models: [] })
    );
    expect(readCachedArnoldModels()).toBeUndefined();
    storage.set(
      MODELS_KEY,
      JSON.stringify({ ...list, defaultId: "openai/removed" })
    );
    expect(readCachedArnoldModels()).toBeUndefined();
  });
});

describe("getSelectedArnoldModelId", () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it("sends the saved pick when the cached list has it", () => {
    writeCachedArnoldModels(list);
    storage.set(SELECTED_MODEL_KEY, "anthropic/claude-haiku-4.5");
    expect(getSelectedArnoldModelId()).toBe("anthropic/claude-haiku-4.5");
  });

  it("sends the default for an old pick", () => {
    writeCachedArnoldModels(list);
    storage.set(SELECTED_MODEL_KEY, "claude-haiku-4-5");
    expect(getSelectedArnoldModelId()).toBe("openai/gpt-5.5");
  });

  it("reads the pick from arnold.model", () => {
    writeCachedArnoldModels(list);
    storage.set("arnold.model", "anthropic/claude-haiku-4.5");
    expect(getSelectedArnoldModelId()).toBe("anthropic/claude-haiku-4.5");
  });

  it("sends no model without a cached list", () => {
    storage.set(SELECTED_MODEL_KEY, "openai/gpt-5.5");
    expect(getSelectedArnoldModelId()).toBeUndefined();
  });
});
