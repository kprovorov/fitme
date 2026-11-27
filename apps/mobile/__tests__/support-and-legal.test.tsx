/**
 * Support and Legal & Privacy, the real screens under the root layout's
 * language sync, in English and Ukrainian. What a test asserts is what the
 * User sees and where each row sends them: the system for `mailto:` and the
 * social profiles, the in-app browser for our Terms and privacy policy, and
 * the clipboard and a toast when no mail app can take the address.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { Linking } from "react-native";

import LegalScreen from "~/app/legal";
import SupportScreen from "~/app/support";
import { Toaster } from "~/components/ui/toast";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: "automatic" },
}));

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

const openURL = jest.spyOn(Linking, "openURL");
const openBrowserAsync = jest.mocked(WebBrowser.openBrowserAsync);
const setStringAsync = jest.mocked(Clipboard.setStringAsync);
const captureException = jest.mocked(Sentry.captureException);

const SUPPORT_EMAIL = "support@fitmeproject.com";

const mount = async (element: ReactNode) => {
  const client = createTestQueryClient();

  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        {element}
        <Toaster />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);

  return client;
};

const press = async (
  label: string,
  client: Awaited<ReturnType<typeof mount>>
) => {
  await fireEvent.press(screen.getByText(label));
  await settle(client);
};

const LANGUAGES = [
  {
    addressCopied: "Address copied",
    contact: "Contact",
    device: "en-US",
    emailSupport: "Email Support",
    follow: "Follow Fitme",
    legalTitle: "Legal & Privacy",
    name: "English",
    privacy: "Privacy Policy",
    supportTitle: "Support",
    terms: "Terms of Service",
  },
  {
    addressCopied: "Адресу скопійовано",
    contact: "Контакти",
    device: "uk-UA",
    emailSupport: "Написати в підтримку",
    follow: "Стежте за Fitme",
    legalTitle: "Правова інформація",
    name: "Ukrainian",
    privacy: "Політика конфіденційності",
    supportTitle: "Підтримка",
    terms: "Умови використання",
  },
] as const;

beforeEach(() => {
  openURL.mockReset();
  openURL.mockResolvedValue(undefined);
  openBrowserAsync.mockReset();
  openBrowserAsync.mockResolvedValue({ type: "dismiss" } as never);
  setStringAsync.mockReset();
  setStringAsync.mockResolvedValue(true);
  captureException.mockClear();
});

describe.each(LANGUAGES)("Support in $name", (language) => {
  beforeEach(() => {
    setDeviceLanguages([language.device]);
  });

  it("shows the Contact and Follow Fitme sections", async () => {
    await mount(<SupportScreen />);

    for (const text of [
      language.supportTitle,
      language.contact,
      language.emailSupport,
      SUPPORT_EMAIL,
      language.follow,
      "X",
      "Instagram",
      "Threads",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it.each([
    ["emailSupport", `mailto:${SUPPORT_EMAIL}`],
    ["X", "https://x.com/fitmeproject"],
    ["Instagram", "https://www.instagram.com/fitmeprojectcom"],
    ["Threads", "https://www.threads.net/@fitmeprojectcom"],
  ] as const)("opens %s's URL through the system", async (row, url) => {
    const client = await mount(<SupportScreen />);

    await press(row === "emailSupport" ? language.emailSupport : row, client);

    expect(openURL).toHaveBeenCalledWith(url);
    expect(setStringAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(language.addressCopied)).toBeNull();
  });

  it("copies the address and says so when no mail app can open it", async () => {
    openURL.mockRejectedValue(
      new Error(`Unable to open URL: mailto:${SUPPORT_EMAIL}`)
    );
    const client = await mount(<SupportScreen />);

    await press(language.emailSupport, client);

    expect(setStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL);
    expect(screen.getByText(language.addressCopied)).toBeTruthy();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports, without a toast, when the address can't be copied either", async () => {
    const failure = new Error("Clipboard unavailable");
    openURL.mockRejectedValue(new Error("Unable to open URL"));
    setStringAsync.mockRejectedValue(failure);
    const client = await mount(<SupportScreen />);

    await press(language.emailSupport, client);

    expect(captureException).toHaveBeenCalledWith(failure);
    expect(screen.queryByText(language.addressCopied)).toBeNull();
  });
});

describe.each(LANGUAGES)("Legal & Privacy in $name", (language) => {
  beforeEach(() => {
    setDeviceLanguages([language.device]);
  });

  it("opens the privacy policy and the Terms in the in-app browser", async () => {
    const client = await mount(<LegalScreen />);

    expect(screen.getByText(language.legalTitle)).toBeTruthy();

    await press(language.privacy, client);
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      "https://fitmeproject.com/privacy",
      expect.anything()
    );

    await press(language.terms, client);
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      "https://fitmeproject.com/terms",
      expect.anything()
    );
    expect(openURL).not.toHaveBeenCalled();
  });
});
