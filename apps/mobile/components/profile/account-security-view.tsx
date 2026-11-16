import { isClerkAPIResponseError, useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, View } from "react-native";

import {
  ProfileListRow,
  ProfileListSection,
} from "~/components/profile/profile-list";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useConnectSignInMethod } from "~/hooks/connect-sign-in-method";
import { useReverifiedCall } from "~/hooks/reverification";
import { isClerkNetworkFailure } from "~/lib/clerk";
import { PROVIDER_NAMES, signInProviders } from "~/lib/sign-in-providers";
import type { SocialProvider } from "~/lib/sign-in-providers";

/**
 * How far Connect's and Disconnect's tap area reaches past the small pill
 * (28 pt), so the target is at least 44 pt.
 */
const PILL_HIT_SLOP = 8;

/** The Delete sheet (`app/delete-account.tsx`). */
const DELETE_ACCOUNT_ROUTE = "/delete-account";

/**
 * What a provider not connected's Connect can do: run (`busy` while it does),
 * or nothing while another Connect or a Disconnect runs (`disabled`).
 */
interface ConnectState {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly handlePress: () => void;
}

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

/** Clerk's answer for an external account that's no longer there. */
const isAlreadyGone = (error: unknown) =>
  isClerkAPIResponseError(error) &&
  error.errors.some(({ code }) => code === "resource_not_found");

/** The providers a User can sign in with, in this build or another. */
const SIGN_IN_PROVIDERS: ReadonlySet<string> = new Set(["apple", "google"]);

const openChangeEmail = () => router.push("/change-email");

/**
 * One sign-in method (Figma's `ListRow`, subtitle type): the provider's name,
 * then the email of the account linked to it, or Not connected. VoiceOver
 * reads the text as one element: the name, then "Connected as <email>" or
 * "Not connected". A linked provider ends in Disconnect, its own element:
 * blocked while it's the User's only way to sign in, which the subtitle and
 * the button's hint say (Figma 1479:5973). One not connected ends in Connect
 * (Figma 1487:4860), read "Connect <provider>", which shows Connecting…
 * beside its spinner (read "Connecting <provider>") while it runs.
 */
const SignInMethodRow = ({
  connect,
  disconnect,
  email,
  first,
  linked,
  provider,
}: {
  connect: ConnectState | null;
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
          // An invisible Pressable behind the pill takes the taps that miss
          // it (as `SetCheckCell` does); a blocked one is dimmed whole, as
          // Figma's is.
          <View className={disconnect.blocked ? "opacity-50" : undefined}>
            <Pressable
              accessible={false}
              className="absolute inset-0"
              disabled={disconnect.disabled}
              hitSlop={PILL_HIT_SLOP}
              onPress={disconnect.handlePress}
            />
            <Button
              accessibilityLabel={
                disconnect.busy ? t("accountSecurity.disconnecting") : undefined
              }
              accessibilityHint={
                disconnect.blocked
                  ? t("accountSecurity.addAnotherMethod")
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
          </View>
        ) : null}
        {connect ? (
          <View>
            <Pressable
              accessible={false}
              className="absolute inset-0"
              disabled={connect.disabled || connect.busy}
              hitSlop={PILL_HIT_SLOP}
              onPress={connect.handlePress}
            />
            <Button
              accessibilityLabel={t(
                connect.busy
                  ? "accountSecurity.connectingProvider"
                  : "accountSecurity.connectProvider",
                { provider: name }
              )}
              disabled={connect.disabled}
              fill={false}
              isLoading={connect.busy}
              label={t("accountSecurity.connect")}
              loadingLabel={t("accountSecurity.connecting")}
              onPress={connect.handlePress}
              size="sm"
              testID={`connect-${provider}`}
              variant="secondary"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

/**
 * Account & Security (Figma 1479:5771), opened from the redesigned Profile:
 * the User's email, whose row opens Change Email, Change Password while
 * they have a password (opening the Change Password Screen), the sign-in
 * methods this build offers (ADR 0021) with whether each is linked, and
 * Delete Account at the bottom, which opens the Delete sheet. A linked
 * provider can be disconnected while
 * the User keeps another way to sign in (ADR 0021): a password, or another
 * linked provider, counted whether or not this build shows its row (Apple on
 * Android still signs the User in on an iPhone). Disconnect confirms first,
 * then goes through "Confirm it's you" when Clerk asks. A provider not
 * linked has Connect (`useConnectSignInMethod`, ADR 0021). Only one Connect
 * or Disconnect runs at a time. The other actions come with their own
 * tickets.
 */
const openChangePassword = () => router.push("/change-password");

const AccountSecurityView = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { connect, connecting } = useConnectSignInMethod();

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
        if (isAlreadyGone(error)) {
          // Disconnected elsewhere: what the User asked for. Read the User
          // again so the row says so; a failed read only leaves it stale.
          await user?.reload().catch(() => undefined);
          setDisconnecting(null);

          return;
        }

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
    [destroyAccount, t, user]
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

  // Only Apple and Google sign a User in: a link to another provider (one
  // the instance no longer offers) is no way back in.
  const verifiedAccounts = user.externalAccounts.filter(
    (account) =>
      account.verification?.status === "verified" &&
      SIGN_IN_PROVIDERS.has(account.provider)
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
          onPress={openChangeEmail}
          testID="account-email"
          value={user.primaryEmailAddress?.emailAddress}
        />
        {user.passwordEnabled ? (
          <ProfileListRow
            label={t("accountSecurity.passwordRow")}
            onPress={openChangePassword}
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
                connect={
                  account
                    ? null
                    : {
                        busy: connecting === provider,
                        disabled:
                          (connecting !== null && connecting !== provider) ||
                          disconnecting !== null,
                        handlePress: () => {
                          void connect(provider);
                        },
                      }
                }
                disconnect={
                  account
                    ? {
                        blocked,
                        busy: disconnecting === provider,
                        disabled:
                          blocked ||
                          disconnecting !== null ||
                          connecting !== null,
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
        <Pressable
          accessibilityLabel={t("accountSecurity.deleteAccount")}
          accessibilityRole="button"
          className="px-sm active:bg-accent min-h-11 justify-center py-3"
          onPress={() => router.push(DELETE_ACCOUNT_ROUTE)}
          testID="delete-account"
        >
          <Text className="text-body text-destructive">
            {t("accountSecurity.deleteAccount")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default AccountSecurityView;
