import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCSSVariable } from "uniwind";

/**
 * Change Email, pushed from Account & Security: the new address, then the
 * shared code screen for it. Opaque headers in the Screen's own color, as
 * the auth Screens have, so a form scrolled up goes under the header.
 */
const ChangeEmailLayout = () => {
  const { t } = useTranslation();
  // SAFETY: The imported design tokens define --color-foreground as a hex color string.
  const foreground = useCSSVariable("--color-foreground") as string;
  // SAFETY: The imported design tokens define --color-background as a hex color string.
  const background = useCSSVariable("--color-background") as string;

  return (
    <Stack
      screenOptions={{
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

export default ChangeEmailLayout;
