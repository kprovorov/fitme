import { useUser } from "@clerk/expo";
import { Stack, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, BackHandler, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScopedVariables } from "uniwind";

import { AndroidGrabber } from "@/components/grabber";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useSubscriptionQuery } from "~/hooks/revenueCat";
import { useReverifiedCall } from "~/hooks/reverification";
import { getClerkErrorMessage } from "~/lib/clerk";
import { openUrl } from "~/lib/external-links";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";
import type { Subscription } from "~/lib/subscription";
import { cn } from "~/lib/utils";

/**
 * Whether deleting the account leaves a store Subscription billing: Fitme Pro
 * that renews, a trial included. A cancelled, lifetime or promotional one
 * never bills again, and Free has nothing to bill.
 */
const willBillAgain = (
  subscription: Subscription | undefined
): subscription is Extract<Subscription, { kind: "pro" }> =>
  subscription?.kind === "pro" &&
  (subscription.status === "renewing" || subscription.status === "trial");

/** The billing warning, naming the store this platform buys through. */
const proWarningKey = () =>
  Platform.OS === "android"
    ? "deleteAccount.proWarning.googlePlay"
    : "deleteAccount.proWarning.appStore";

/**
 * The Delete sheet (Figma's Delete (Pro), 1482:7843), opened from Account &
 * Security: what gets deleted, the billing warning with Manage Subscription
 * while the User's Subscription will bill again, then Delete Account and
 * Cancel.
 *
 * Delete Account runs `user.delete()` through "Confirm it's you" when Clerk
 * asks for it, then the clean-up every deletion does (`useDeleteUserMutation`:
 * the Arnold device copies, the sign-out) and lands on the signed-out screen.
 * A failure keeps the account and everything on the device, and says so; a
 * cancelled "Confirm it's you" leaves the sheet as it was.
 */
const DeleteAccountSheet = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation(undefined, { i18n });
  const { user } = useUser();

  const { data: subscription, isPending: isReadingSubscription } =
    useSubscriptionQuery();

  const { isPending, mutate: deleteAccount } = useDeleteUserMutation();

  const removeUser = useCallback(async () => {
    // Signed out meanwhile: there's no account left to delete.
    if (!user) {
      throw new Error("No signed-in User to delete");
    }

    await user.delete();
  }, [user]);

  const reverifiedRemove = useReverifiedCall(removeUser);

  const confirmDelete = useCallback(() => {
    deleteAccount(
      { remove: reverifiedRemove },
      {
        onError: (error) => {
          Alert.alert(t("deleteAccount.failed"), getClerkErrorMessage(error));
        },
      }
    );
  }, [deleteAccount, reverifiedRemove, t]);

  const close = useCallback(() => router.back(), [router]);

  // Android's Back would close the sheet mid-deletion as a swipe would:
  // it's swallowed until the deletion settles, but only while this sheet is
  // on top, so Back still cancels "Confirm it's you" above it.
  useEffect(() => {
    if (!isPending) {
      return;
    }

    const handler = BackHandler.addEventListener("hardwareBackPress", () =>
      navigation.isFocused()
    );

    return () => handler.remove();
  }, [isPending, navigation]);

  const billing = willBillAgain(subscription) ? subscription : null;
  const managementURL = billing?.managementURL ?? null;

  return (
    <ScopedVariables variables={{ "--delete-sheet-bottom": insets.bottom }}>
      <Stack.Screen options={{ gestureEnabled: !isPending }} />
      <View
        className={cn(
          // iOS floats the sheet above the home indicator itself.
          process.env.EXPO_OS === "android" && "pb-(--delete-sheet-bottom)"
        )}
        testID="delete-account-sheet"
      >
        <AndroidGrabber />
        <View className="gap-sm px-sm pt-md pb-sm">
          <View className="gap-xs px-xs">
            <Text
              accessibilityRole="header"
              className="text-headline-emphasized text-foreground text-center"
            >
              {t("deleteAccount.title")}
            </Text>
            <Text className="text-subhead text-muted-foreground text-center">
              {t("deleteAccount.message")}
            </Text>
            {billing ? (
              <Text
                className="text-subhead text-muted-foreground mt-3 text-center"
                testID="delete-account-billing-warning"
              >
                {t(proWarningKey())}
              </Text>
            ) : null}
          </View>
          <View className="gap-xs">
            {managementURL ? (
              <Button
                contentColorClassName="text-primary"
                disabled={isPending}
                fill
                label={t("deleteAccount.manageSubscription")}
                onPress={() => {
                  void openUrl(managementURL);
                }}
                size="lg"
                testID="delete-account-manage"
                variant="ghost"
              />
            ) : null}
            <Button
              accessibilityLabel={
                isPending ? t("deleteAccount.deleting") : undefined
              }
              // Held until the Subscription is known, so a User it will
              // keep billing never deletes before reading the warning.
              disabled={isReadingSubscription}
              isLoading={isPending}
              label={t("deleteAccount.confirm")}
              onPress={confirmDelete}
              size="lg"
              testID="delete-account-confirm"
              variant="destructive"
            />
          </View>
          <Button
            disabled={isPending}
            label={t("common.cancel")}
            onPress={close}
            size="lg"
            testID="delete-account-cancel"
            variant="secondary"
          />
        </View>
      </View>
    </ScopedVariables>
  );
};

export default DeleteAccountSheet;
