import { useUser } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  ProfileListRow,
  ProfileListSection,
} from "~/components/profile/profile-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { signInProviders } from "~/lib/sign-in-providers";
import type { SocialProvider } from "~/lib/sign-in-providers";

// Brand names, the same in every App language.
const PROVIDER_NAMES: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
};

/**
 * One sign-in method (Figma's `ListRow`, subtitle type): the provider's name,
 * then the email of the account linked to it, or Not connected. VoiceOver
 * reads it as one element: the name, then "Connected as <email>" or "Not
 * connected". Connect and Disconnect come with their own tickets.
 */
const SignInMethodRow = ({
  email,
  first,
  linked,
  provider,
}: {
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

  return (
    <View
      accessibilityLabel={name}
      accessibilityValue={{ text: status }}
      accessible
      className="pl-sm"
      testID={`sign-in-method-${provider}`}
    >
      {first ? null : <Separator />}
      <View className="gap-xs pr-sm min-h-11 flex-row items-center py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-body text-foreground">{name}</Text>
          <Text
            className="text-footnote text-muted-foreground"
            ellipsizeMode="middle"
            numberOfLines={1}
          >
            {linked && email ? email : status}
          </Text>
        </View>
      </View>
    </View>
  );
};

/**
 * Account & Security (Figma 1479:5771), opened from the redesigned Profile:
 * the User's email, Change Password while they have a password, the sign-in
 * methods this build offers (ADR 0021) with whether each is linked, and
 * Delete Account at the bottom. The actions on each come with their own
 * tickets, so no row is a control yet.
 */
const AccountSecurityView = () => {
  const { t } = useTranslation();
  const { user } = useUser();

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

            return (
              <SignInMethodRow
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
