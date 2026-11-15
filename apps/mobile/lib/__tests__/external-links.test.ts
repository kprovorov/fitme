import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import {
  openAppSettings,
  openUrl,
  openWebPage,
  TERMS_URL,
} from "../external-links";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: "automatic" },
  WebBrowserResultType: { DISMISS: "dismiss" },
}));

const openBrowserAsync = jest.mocked(WebBrowser.openBrowserAsync);
const captureException = jest.mocked(Sentry.captureException);
const openURL = jest.spyOn(Linking, "openURL");
const openSettings = jest.spyOn(Linking, "openSettings");

beforeEach(() => {
  openBrowserAsync.mockReset();
  captureException.mockClear();
  openURL.mockReset();
  openSettings.mockReset();
});

describe("openWebPage", () => {
  it("opens the page in the in-app browser", async () => {
    openBrowserAsync.mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.DISMISS,
    });

    await openWebPage(TERMS_URL);

    expect(openBrowserAsync).toHaveBeenCalledWith(TERMS_URL, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
    expect(openURL).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("falls back to the system when the in-app browser throws", async () => {
    openBrowserAsync.mockRejectedValue(new Error("Native failure"));
    openURL.mockResolvedValue(undefined);

    await openWebPage(TERMS_URL);

    expect(openURL).toHaveBeenCalledWith(TERMS_URL);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports, never rejects, when nothing can open the page", async () => {
    const failure = new Error(`Unable to open URL: ${TERMS_URL}`);
    openBrowserAsync.mockRejectedValue(new Error("Native failure"));
    openURL.mockRejectedValue(failure);

    await expect(openWebPage(TERMS_URL)).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(failure);
  });
});

describe("openUrl", () => {
  it("hands the URL to the system", async () => {
    openURL.mockResolvedValue(undefined);

    await openUrl("mailto:support@fitmeproject.com");

    expect(openURL).toHaveBeenCalledWith("mailto:support@fitmeproject.com");
    expect(openBrowserAsync).not.toHaveBeenCalled();
  });

  it("reports, never rejects, when the system can't open it", async () => {
    const failure = new Error(
      "Unable to open URL: mailto:support@fitmeproject.com"
    );

    openURL.mockRejectedValue(failure);

    await expect(
      openUrl("mailto:support@fitmeproject.com")
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("runs the caller's fallback instead of reporting when the system can't open it", async () => {
    const onUnopened = jest.fn<() => void>();

    openURL.mockRejectedValue(new Error("Unable to open URL"));

    await openUrl("mailto:support@fitmeproject.com", { onUnopened });

    expect(onUnopened).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports a failure that isn't the system's refusal, and runs the fallback", async () => {
    const failure = new Error("Native module failure");
    const onUnopened = jest.fn<() => void>();

    openURL.mockRejectedValue(failure);

    await openUrl("mailto:support@fitmeproject.com", { onUnopened });

    expect(onUnopened).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("reports, never rejects, when the fallback throws", async () => {
    const failure = new Error("Clipboard unavailable");

    openURL.mockRejectedValue(new Error("Unable to open URL"));

    await expect(
      openUrl("mailto:support@fitmeproject.com", {
        onUnopened: () => {
          throw failure;
        },
      })
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("leaves the fallback alone when the system opens the URL", async () => {
    const onUnopened = jest.fn<() => void>();

    openURL.mockResolvedValue(undefined);

    await openUrl("mailto:support@fitmeproject.com", { onUnopened });

    expect(onUnopened).not.toHaveBeenCalled();
  });
});

describe("openAppSettings", () => {
  it("opens Fitme's own page in the system Settings", async () => {
    openSettings.mockResolvedValue(undefined);

    await openAppSettings();

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports, never rejects, when the system can't open Settings", async () => {
    const failure = new Error("Unable to open settings");
    openSettings.mockRejectedValue(failure);

    await expect(openAppSettings()).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledWith(failure);
  });
});
