import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <VStack>
        <H1>{t("notFound.description")}</H1>
        <Link asChild href="/">
          <Button label={t("notFound.goHome")} />
        </Link>
      </VStack>
    </>
  );
}
