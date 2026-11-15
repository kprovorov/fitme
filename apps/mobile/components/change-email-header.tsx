import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCSSVariable } from "uniwind";

/**
 * Change Email's header, on both its Screens (the new address and the code):
 * pushed on the root stack, so its back button goes back a step, opaque in
 * the Screen's own color, as the auth Screens' is, so a form scrolled up goes
 * under it.
 */
export const ChangeEmailHeader = () => {
  const { t } = useTranslation();
  // SAFETY: The imported design tokens define --color-foreground as a hex color string.
  const foreground = useCSSVariable("--color-foreground") as string;
  // SAFETY: The imported design tokens define --color-background as a hex color string.
  const background = useCSSVariable("--color-background") as string;

  return (
    <Stack.Screen
      options={{
        headerBackButtonDisplayMode: "minimal",
        headerShadowVisible: false,
        headerShown: true,
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
        headerTitleStyle: {
          fontFamily: "NunitoSans-Bold",
          fontWeight: "bold",
        },
        title: t("changeEmail.title"),
      }}
    />
  );
};
