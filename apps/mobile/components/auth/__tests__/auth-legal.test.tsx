import { beforeEach, expect, jest, test } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { test, expect, beforeEach } from "vitest";

import { PRIVACY_POLICY_URL, TERMS_URL } from "~/lib/external-links";

import { AuthLegal } from "../auth-links";

// AuthLegal never navigates; the real router pulls in ESM-only modules
jest.mock<typeof import("expo-router")>(import("expo-router"), () => ({
  router: { replace: jest.fn() },
}));

jest.mock<typeof import("expo-web-browser")>(
  import("expo-web-browser"),
  () => ({
    openBrowserAsync: jest.fn(),
    WebBrowserPresentationStyle: { AUTOMATIC: "automatic" },
  })
);

const openBrowserAsync = jest.mocked(WebBrowser.openBrowserAsync);
const openURL = jest.spyOn(Linking, "openURL");

beforeEach(() => {
  openBrowserAsync.mockReset();
  openURL.mockReset();
  jest.mocked(Sentry.captureException).mockClear();
});

test("opens the Terms and the privacy policy in the in-app browser", async () => {
  openBrowserAsync.mockResolvedValue({
    type: "dismiss",
  } as WebBrowser.WebBrowserResult);
  await render(<AuthLegal />);

  await fireEvent.press(screen.getByText("Terms of Service"));
  await fireEvent.press(screen.getByText("Privacy Policy."));

  expect(openBrowserAsync.mock.calls.map(([url]) => url)).toEqual([
    TERMS_URL,
    PRIVACY_POLICY_URL,
  ]);
});

test("reports a Terms link nothing can open instead of rejecting", async () => {
  const failure = new Error(`Unable to open URL: ${TERMS_URL}`);
  openBrowserAsync.mockRejectedValue(new Error("Native failure"));
  openURL.mockRejectedValue(failure);
  await render(<AuthLegal />);

  await fireEvent.press(screen.getByText("Terms of Service"));

  expect(openURL).toHaveBeenCalledWith(TERMS_URL);
  expect(Sentry.captureException).toHaveBeenCalledWith(failure);
});
