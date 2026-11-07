import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { openUrl, openWebPage, TERMS_URL } from "../external-links";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: "automatic" },
  WebBrowserResultType: { DISMISS: "dismiss" },
}));

const openBrowserAsync = jest.mocked(WebBrowser.openBrowserAsync);
const captureException = jest.mocked(Sentry.captureException);
const openURL = jest.spyOn(Linking, "openURL");

beforeEach(() => {
  openBrowserAsync.mockReset();
  captureException.mockClear();
  openURL.mockReset();
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
});
