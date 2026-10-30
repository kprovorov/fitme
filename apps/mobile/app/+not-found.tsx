import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <VStack className="flex-1 items-center justify-center gap-4 bg-background p-lg">
      <H3 className="text-center">{t("notFound.title")}</H3>
      <Text className="text-center text-body-emphasized text-muted-foreground">
        {t("notFound.description")}
      </Text>
      <Link asChild href="/">
        <Button label={t("notFound.goHome")} />
      </Link>
    </VStack>
  );
}
