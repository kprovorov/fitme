import { useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";

import {
  ProfileListRow,
  ProfileListSection,
} from "~/components/profile/profile-list";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useReverifiedCall } from "~/hooks/reverification";
import { isClerkNetworkFailure } from "~/lib/clerk";
import { signInProviders } from "~/lib/sign-in-providers";
import type { SocialProvider } from "~/lib/sign-in-providers";

// Brand names, the same in every App language.
const PROVIDER_NAMES: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
};

/**
 * What a linked provider's Disconnect can do: nothing while it would leave the
 * User no way to sign in (`blocked`), or run while another call isn't.
 */
interface DisconnectState {
  readonly blocked: boolean;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly handlePress: () => void;
}

/**
 * One sign-in method (Figma's `ListRow`, subtitle type): the provider's name,
 * then the email of the account linked to it, or Not connected. VoiceOver
 * reads the text as one element: the name, then "Connected as <email>" or
 * "Not connected". A linked provider ends in Disconnect, its own element:
 * blocked while it's the User's only way to sign in, which the subtitle and
 * the button's hint say (Figma 1479:5973). Connect comes with its own ticket.
 */
const SignInMethodRow = ({
  disconnect,
  email,
  first,
  linked,
  provider,
}: {
  disconnect: DisconnectState | null;
  email: string | null;
  first: boolean;
  linked: boolean;
  provider: SocialProvider;
}) => {
  const { t } = useTranslation();
  const name = PROVIDER_NAMES[provider];

  let status = t("accountSecurity.notConnected");

  if (linked) {
    status = email
      ? t("accountSecurity.connectedAs", { email })
      : t("accountSecurity.connected");
  }

  let subtitle = linked && email ? email : status;

  if (disconnect?.blocked) {
    subtitle = t("accountSecurity.addAnotherMethod");
  }

  return (
    <View className="pl-sm" testID={`sign-in-method-${provider}`}>
      {first ? null : <Separator />}
      <View className="gap-xs pr-sm min-h-11 flex-row items-center py-3">
        <View
          accessibilityLabel={name}
          accessibilityValue={{ text: status }}
          accessible
          className="flex-1 gap-0.5"
        >
          <Text className="text-body text-foreground">{name}</Text>
          {/* An email keeps one line, cut in the middle; the reason a
              Disconnect is blocked is a sentence, which wraps. */}
          <Text
            className="text-footnote text-muted-foreground"
            ellipsizeMode="middle"
            numberOfLines={disconnect?.blocked ? undefined : 1}
          >
            {subtitle}
          </Text>
        </View>
        {disconnect ? (
          <Button
            accessibilityLabel={
              disconnect.busy ? t("accountSecurity.disconnecting") : undefined
            }
            accessibilityHint={
              disconnect.blocked
                ? t("accountSecurity.addAnotherMethod")
                : undefined
            }
            // A native style keeps its label's color when disabled: grey it,
            // as Figma's blocked Disconnect is.
            contentColorClassName={
              disconnect.disabled && !disconnect.busy
                ? "text-muted-foreground"
                : undefined
            }
            disabled={disconnect.disabled}
            fill={false}
            isLoading={disconnect.busy}
            // The spinner takes the label's place at the label's width, so
            // the pill doesn't grow; VoiceOver hears what's happening.
            label={t("accountSecurity.disconnect")}
            onPress={disconnect.handlePress}
            size="sm"
            testID={`disconnect-${provider}`}
            variant="secondary"
          />
        ) : null}
      </View>
    </View>
  );
};

/**
 * Account & Security (Figma 1479:5771), opened from the redesigned Profile:
 * the User's email, Change Password while they have a password, the sign-in
 * methods this build offers (ADR 0021) with whether each is linked, and
 * Delete Account at the bottom. A linked provider can be disconnected while
 * the User keeps another way to sign in (ADR 0021): a password, or another
 * linked provider, counted whether or not this build shows its row (Apple on
 * Android still signs the User in on an iPhone). Disconnect confirms first,
 * then goes through "Confirm it's you" when Clerk asks. The other actions
 * come with their own tickets.
 */
const AccountSecurityView = () => {
  const { t } = useTranslation();
  const { user } = useUser();

  const [disconnecting, setDisconnecting] = useState<SocialProvider | null>(
    null
  );

  const destroyAccount = useReverifiedCall(
    async (externalAccountId: string) => {
      const account = user?.externalAccounts.find(
        (item) => item.id === externalAccountId
      );

      // Already gone (disconnected elsewhere): nothing left to do.
      await account?.destroy();
    }
  );

  const disconnect = useCallback(
    async (provider: SocialProvider, externalAccountId: string) => {
      setDisconnecting(provider);

      try {
        await destroyAccount(externalAccountId);
      } catch (error) {
        if (!isClerkNetworkFailure(error)) {
          captureException(error);
        }

        Alert.alert(
          t("accountSecurity.errors.disconnectFailed", {
            provider: PROVIDER_NAMES[provider],
          })
        );
      }

      // Done, failed or cancelled: the buttons are live again.
      setDisconnecting(null);
    },
    [destroyAccount, t]
  );

  const confirmDisconnect = useCallback(
    (provider: SocialProvider, externalAccountId: string) => {
      const name = PROVIDER_NAMES[provider];

      Alert.alert(
        t("accountSecurity.disconnectConfirm.title", { provider: name }),
        t("accountSecurity.disconnectConfirm.message", { provider: name }),
        [
          { style: "cancel", text: t("common.cancel") },
          {
            onPress: () => {
              void disconnect(provider, externalAccountId);
            },
            style: "destructive",
            text: t("accountSecurity.disconnect"),
          },
        ]
      );
    },
    [disconnect, t]
  );

  if (!user) {
    return null;
  }

  const providers = signInProviders();

  // Only a verified link signs the User in: one still waiting on the
  // provider (a Connect the User backed out of) isn't connected yet.
  const linkedAccount = (provider: SocialProvider) =>
    user.externalAccounts.find(
      (account) =>
        account.provider === provider &&
        account.verification?.status === "verified"
    );

  const verifiedAccounts = user.externalAccounts.filter(
    (account) => account.verification?.status === "verified"
  );

  // A password or another linked provider keeps the User able to sign in.
  const canDisconnect = (externalAccountId: string) =>
    user.passwordEnabled ||
    verifiedAccounts.some((account) => account.id !== externalAccountId);

  return (
    <View className="gap-md w-full pt-2.5 pb-14">
      <ProfileListSection title={t("accountSecurity.sections.signIn")}>
        <ProfileListRow
          first
          label={t("accountSecurity.email")}
          testID="account-email"
          value={user.primaryEmailAddress?.emailAddress}
        />
        {user.passwordEnabled ? (
          <ProfileListRow
            label={t("accountSecurity.passwordRow")}
            testID="account-password"
          />
        ) : null}
      </ProfileListSection>

      {providers.length > 0 ? (
        <ProfileListSection title={t("accountSecurity.sections.methods")}>
          {providers.map((provider, index) => {
            const account = linkedAccount(provider);
            const blocked = account ? !canDisconnect(account.id) : false;

            return (
              <SignInMethodRow
                disconnect={
                  account
                    ? {
                        blocked,
                        busy: disconnecting === provider,
                        disabled: blocked || disconnecting !== null,
                        handlePress: () =>
                          confirmDisconnect(provider, account.id),
                      }
                    : null
                }
                email={account?.emailAddress || null}
                first={index === 0}
                key={provider}
                linked={account !== undefined}
                provider={provider}
              />
            );
          })}
        </ProfileListSection>
      ) : null}

      <View className="rounded-card border-border bg-card w-full overflow-hidden border">
        <View
          accessibilityLabel={t("accountSecurity.deleteAccount")}
          accessibilityRole="text"
          accessible
          className="px-sm min-h-11 justify-center py-3"
          testID="delete-account"
        >
          <Text className="text-body text-destructive">
            {t("accountSecurity.deleteAccount")}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default AccountSecurityView;
