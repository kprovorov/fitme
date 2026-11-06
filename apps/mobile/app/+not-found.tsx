import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

const NotFoundScreen = () => {
  const { t } = useTranslation();

  return (
    <View className="bg-background p-lg flex-1">
      <VStack className="flex-1">
        <H3 className="text-center">{t("notFound.title")}</H3>
        <Text className="text-center" variant="muted">
          {t("notFound.description")}
        </Text>
        <Link asChild href="/">
          <Button label={t("notFound.goHome")} />
        </Link>
      </VStack>
    </View>
  );
};

export default NotFoundScreen;
