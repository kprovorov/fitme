import { Link, Stack } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { buttonTextVariants, buttonVariants } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemLabel } from "~/lib/labels";

export default function SettingsScreen() {
  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: deleteUser, isPending } = useDeleteUserMutation();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Settings",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <SafeAreaView className="flex-1">
        <ScrollView
          className="flex-1 p-6"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          {!!user && (
            <>
              <MenuList>
                <Link asChild href="/settings/measurement-system">
                  <MenuListItem icon="chevron-right">
                    <HStack className="flex-1 justify-between">
                      <Text>Measurement System</Text>
                      <Text className="text-muted-foreground text-xs">
                        {getMeasurementSystemLabel(
                          user.profile?.measurement_system ?? "metric"
                        )}
                      </Text>
                    </HStack>
                  </MenuListItem>
                </Link>
              </MenuList>

              <MenuList className="mt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <MenuListItem disabled={isPending}>
                      <Text className="text-destructive">Delete Account</Text>
                    </MenuListItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Account</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your account and all
                        associated data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        <Text>Cancel</Text>
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onPress={() => deleteUser()}
                      >
                        <Text
                          className={buttonTextVariants({
                            variant: "destructive",
                          })}
                        >
                          Delete
                        </Text>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </MenuList>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
