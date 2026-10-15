import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  type CoachModelList,
  getSelectedCoachModelId,
  MODELS_KEY,
  readCachedCoachModels,
  resolveCoachModel,
  SELECTED_MODEL_KEY,
  writeCachedCoachModels,
} from "../coach-model";
import { storage } from "../mmkv";

const list: CoachModelList = {
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

describe("resolveCoachModel", () => {
  it("keeps a saved pick that is in the list", () => {
    expect(resolveCoachModel("anthropic/claude-haiku-4.5", list)?.label).toBe(
      "Claude Haiku 4.5"
    );
  });

  it("falls back to the list's default for a pick that isn't in it", () => {
    expect(resolveCoachModel("gpt-5.5", list)?.id).toBe("openai/gpt-5.5");
    expect(resolveCoachModel("openai/removed", list)?.id).toBe(
      "openai/gpt-5.5"
    );
  });

  it("uses the default when nothing was picked", () => {
    expect(resolveCoachModel(undefined, list)?.id).toBe("openai/gpt-5.5");
  });

  it("resolves to no model without a list", () => {
    expect(resolveCoachModel("openai/gpt-5.5", undefined)).toBeUndefined();
  });
});

describe("coach.models cache", () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it("reads back the list it wrote", () => {
    writeCachedCoachModels(list);
    expect(readCachedCoachModels()).toEqual(list);
  });

  it("has no list before anything is cached", () => {
    expect(readCachedCoachModels()).toBeUndefined();
  });

  it("treats an unreadable value as no list", () => {
    storage.set(MODELS_KEY, "{not json");
    expect(readCachedCoachModels()).toBeUndefined();
  });

  it("treats a value of another shape as no list", () => {
    storage.set(MODELS_KEY, JSON.stringify({ models: "nope" }));
    expect(readCachedCoachModels()).toBeUndefined();
    storage.set(MODELS_KEY, JSON.stringify([list]));
    expect(readCachedCoachModels()).toBeUndefined();
  });

  it("treats a list without models, or whose default isn't in it, as no list", () => {
    storage.set(
      MODELS_KEY,
      JSON.stringify({ defaultId: "openai/gpt-5.5", models: [] })
    );
    expect(readCachedCoachModels()).toBeUndefined();
    storage.set(
      MODELS_KEY,
      JSON.stringify({ ...list, defaultId: "openai/removed" })
    );
    expect(readCachedCoachModels()).toBeUndefined();
  });
});

describe("getSelectedCoachModelId", () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it("sends the saved pick when the cached list has it", () => {
    writeCachedCoachModels(list);
    storage.set(SELECTED_MODEL_KEY, "anthropic/claude-haiku-4.5");
    expect(getSelectedCoachModelId()).toBe("anthropic/claude-haiku-4.5");
  });

  it("sends the default for an old pick", () => {
    writeCachedCoachModels(list);
    storage.set(SELECTED_MODEL_KEY, "claude-haiku-4-5");
    expect(getSelectedCoachModelId()).toBe("openai/gpt-5.5");
  });

  it("sends no model without a cached list", () => {
    storage.set(SELECTED_MODEL_KEY, "openai/gpt-5.5");
    expect(getSelectedCoachModelId()).toBeUndefined();
  });
});
