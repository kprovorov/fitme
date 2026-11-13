import * as Sentry from "@sentry/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

/** Our Terms of Service and privacy policy, on the marketing site. */
export const TERMS_URL = "https://fitmeproject.com/terms";
export const PRIVACY_POLICY_URL = "https://fitmeproject.com/privacy";

/**
 * Hands a URL to the system (a `mailto:`, a store link, a page another app
 * claims). The system can refuse (`Unable to open URL`): that's reported,
 * never left as an unhandled rejection.
 */
export const openUrl = async (url: string): Promise<void> => {
  try {
    await Linking.openURL(url);
  } catch (error) {
    Sentry.captureException(error);
  }
};

/**
 * Opens Fitme's own page in the system Settings, where a permission the User
 * refused (camera access for an Arnold Attachment) can be turned back on.
 * Like `openUrl`, a system that refuses is reported rather than left as an
 * unhandled rejection.
 */
export const openAppSettings = async (): Promise<void> => {
  try {
    await Linking.openSettings();
  } catch (error) {
    Sentry.captureException(error);
  }
};

/**
 * Opens a web page of ours (the Terms, the privacy policy, a link in an Arnold
 * answer) in the in-app browser, so it never depends on the device letting the
 * app hand off to Safari. When the in-app browser throws (a URL that isn't
 * http(s), a native failure), the system gets the URL; if that fails too it's
 * reported. A browser already open answers `locked` without throwing: the
 * User is looking at a page already, so nothing more opens.
 */
export const openWebPage = async (url: string): Promise<void> => {
  if (process.env.EXPO_OS === "web") {
    await openUrl(url);

    return;
  }

  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
  } catch {
    await openUrl(url);
  }
};
