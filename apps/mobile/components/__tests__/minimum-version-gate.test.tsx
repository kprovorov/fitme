import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState, type AppStateStatus, Linking, Text } from "react-native";
import { useClientConfigQuery } from "~/hooks/queries/client-config";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import MinimumVersionGate from "../minimum-version-gate";

const INSTALLED_VERSION = "1.4.0";
const APP_STORE_URL = "https://apps.apple.com/app/id6741153628";
const API_URL = "https://api.example.com";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fitmeproject.ios" },
      ios: { appStoreUrl: "https://apps.apple.com/app/id6741153628" },
      version: "1.4.0",
    },
  },
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mockFetch = jest.fn<typeof fetch>();
const openURL = jest.spyOn(Linking, "openURL");
let changeAppState: (state: AppStateStatus) => void = () => undefined;

/** The API answers with this minimum iOS version from now on. */
const serveMinimumIosVersion = (ios: string | null) => {
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      Response.json({ data: { minimumVersion: { android: null, ios } } })
    )
  );
};

const renderGate = async () => {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <MinimumVersionGate>
          <Text>Home</Text>
        </MinimumVersionGate>
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
  expect(["success", "error"]).toContain(
    queryClient.getQueryState(useClientConfigQuery.getKey())?.status
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_API_URL = API_URL;
  global.fetch = mockFetch;
  openURL.mockResolvedValue();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, handler) => {
    changeAppState = handler;
    return { remove: jest.fn() };
  });
});

describe("MinimumVersionGate", () => {
  it("blocks the app below the minimum and links to the store", async () => {
    serveMinimumIosVersion("1.5.0");

    await renderGate();

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_URL}/v1/client-config`,
      expect.anything()
    );
    expect(await screen.findByText("Update required")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Update" }));

    expect(openURL).toHaveBeenCalledWith(APP_STORE_URL);
  });

  it("changes nothing at the minimum", async () => {
    serveMinimumIosVersion(INSTALLED_VERSION);

    await renderGate();

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.queryByText("Update required")).toBeNull();
  });

  it("changes nothing when there is no minimum", async () => {
    serveMinimumIosVersion(null);

    await renderGate();

    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("doesn't block when the config request fails", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    await renderGate();

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.queryByText("Update required")).toBeNull();
  });

  it("doesn't block when the API answers with an error", async () => {
    mockFetch.mockResolvedValue(new Response("Bad gateway", { status: 502 }));

    await renderGate();

    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("doesn't block when the API answers with an unexpected payload", async () => {
    mockFetch.mockResolvedValue(Response.json({ data: {} }));

    await renderGate();

    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("checks again when the app returns to the foreground", async () => {
    serveMinimumIosVersion("1.5.0");
    await renderGate();
    expect(await screen.findByText("Update required")).toBeTruthy();

    serveMinimumIosVersion("1.3.0");
    await act(async () => {
      changeAppState("active");
      await Promise.resolve();
    });

    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.queryByText("Update required")).toBeNull();
  });
});

describe("MinimumVersionGate on a Ukrainian device", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  afterEach(async () => {
    // The next English test renders without the sync.
    await i18n.changeLanguage("en");
  });

  it("asks for the update in Ukrainian and links to the store", async () => {
    serveMinimumIosVersion("1.5.0");

    await renderGate();

    expect(await screen.findByText("Потрібне оновлення")).toBeTruthy();
    expect(
      screen.getByText(
        "Ця версія Fitme більше не підтримується. Оновіть застосунок, щоб і далі тренуватися."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Update required")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Оновити" }));

    expect(openURL).toHaveBeenCalledWith(APP_STORE_URL);
  });
});
