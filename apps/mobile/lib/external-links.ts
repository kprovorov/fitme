import * as Sentry from "@sentry/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

/**
 * Hands a URL to the system (a `mailto:`, a store link, a page another app
 * claims). The system can refuse (`Unable to open URL`): that's reported,
 * never left as an unhandled rejection.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (error) {
    Sentry.captureException(error);
  }
}

/**
 * Opens a web page of ours (the Terms, the privacy policy, a link in an Arnold
 * answer) in the in-app browser, so it never depends on the device letting the
 * app hand off to Safari. The in-app browser can fail too (one is already
 * open): then the system gets the URL; if that fails it's reported.
 */
export async function openWebPage(url: string): Promise<void> {
  if (process.env.EXPO_OS === "web") {
    return openUrl(url);
  }
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
  } catch {
    await openUrl(url);
  }
}
