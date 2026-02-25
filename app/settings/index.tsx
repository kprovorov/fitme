import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { Text } from "~/components/ui/text";
import { Link, Stack } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemLabel } from "~/lib/labels";
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
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { buttonTextVariants, buttonVariants } from "~/components/ui/button";

export default function SettingsScreen() {
  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: deleteUser, isPending } = useDeleteUserMutation();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: "Settings",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
          >
            {!!user && (
              <>
                <MenuList>
                  <Link href="/settings/measurement-system" asChild>
                    <MenuListItem icon="chevron-right">
                      <HStack className="flex-1 justify-between">
                        <Text>Measurement System</Text>
                        <Text className="text-muted-foreground text-xs">
                          {getMeasurementSystemLabel(
                            user.profile?.measurement_system ?? "metric",
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
      </SafeAreaProvider>
    </>
  );
}
