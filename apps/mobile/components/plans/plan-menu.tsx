import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "../ui/dropdown-menu";

/**
 * The Workout tab's Plan menu: a lime sliders button (Figma's ghost circle
 * Button) opening Manage Plans and Create Plan.
 */
export default function PlanMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <DropdownMenu
      accessibilityLabel={t("home.planMenu")}
      iconColorClassName="text-primary"
      items={[
        {
          label: t("home.managePlans"),
          onPress: () => router.push("/plans"),
          systemImage: "list.bullet",
        },
        {
          label: t("home.createPlan"),
          onPress: () => router.push("/planner"),
          systemImage: "plus",
        },
      ]}
      systemImage="slider.horizontal.3"
    />
  );
}
