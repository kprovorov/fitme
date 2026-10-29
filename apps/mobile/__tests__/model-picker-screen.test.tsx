/**
 * The Arnold model picker's text in the App language: the real sheet and
 * hook over the fake Public API and MMKV. The models' labels and descriptions
 * are the served list's, shown as served whatever the language.
 */
import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";
import ModelPickerSheet from "~/app/(tabs)/arnold/model-picker";
import { useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  FAKE_PUBLIC_API_URL,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const MODELS_ROUTE = "GET /v1/arnold/models";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("@/components/symbol-image", () => ({ SymbolImage: () => null }));

const { EXPO_PUBLIC_API_URL } = process.env;

/** The sheet under the root layout's language sync. */
function Sheet() {
  useAppLanguageSync();
  return <ModelPickerSheet />;
}

/** The served default model's row is the selected one. */
const expectDefaultSelected = () => {
  const defaultModel = arnoldModels.find(
    ({ id }) => id === defaultArnoldModelId
  );
  const selected = screen.getByRole("radio", { selected: true });
  expect(within(selected).getByText(defaultModel?.label ?? "")).toBeTruthy();
};

const renderPicker = async ({ wait = true } = {}) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <Sheet />
    </QueryClientProvider>
  );
  if (wait) {
    await settle(client);
  }
  return client;
};

beforeEach(() => {
  storage.clearAll();
  process.env.EXPO_PUBLIC_API_URL = FAKE_PUBLIC_API_URL;
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = EXPO_PUBLIC_API_URL;
});

describe("Model picker", () => {
  it("lists the served models in English, the default one selected", async () => {
    await renderPicker();

    expect(screen.getByText("Applies to your next message")).toBeTruthy();
    expectDefaultSelected();
  });

  it("says the models aren't available in English", async () => {
    fakePublicApi.failNext(MODELS_ROUTE, { status: 500 });
    await renderPicker();

    expect(
      screen.getByText(
        "Models aren't available right now. Your messages use Arnold's default model."
      )
    ).toBeTruthy();
  });
});

describe("Model picker in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("lists the served models as served, the default one selected", async () => {
    await renderPicker();

    expect(screen.getByText("Діє з наступного повідомлення")).toBeTruthy();
    for (const { description, label } of arnoldModels) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(description)).toBeTruthy();
    }
    expectDefaultSelected();
  });

  it("names the loading state", async () => {
    const resume = fakePublicApi.pause(MODELS_ROUTE);
    const client = await renderPicker({ wait: false });

    expect(screen.getByLabelText("Завантаження моделей")).toBeTruthy();

    resume();
    await settle(client);
    expect(screen.queryByLabelText("Завантаження моделей")).toBeNull();
  });

  it("says the models aren't available", async () => {
    fakePublicApi.failNext(MODELS_ROUTE, { status: 500 });
    await renderPicker();

    expect(
      screen.getByText(
        "Моделі зараз недоступні. Ваші повідомлення використовують стандартну модель Arnold."
      )
    ).toBeTruthy();
  });
});
