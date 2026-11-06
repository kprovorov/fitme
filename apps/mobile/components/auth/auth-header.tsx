import { View } from "react-native";

import { Image } from "~/components/image";
import { Text } from "~/components/ui/text";
import { H1, H2 } from "~/components/ui/typography";

const welcomeMark = require("~/assets/auth/mark-welcome.svg");
const mark = require("~/assets/auth/mark.svg");

export const AuthHeader = ({
  title,
  description,
  welcome = false,
}: {
  title: string;
  description?: string;
  welcome?: boolean;
}) => (
  <View className={welcome ? "gap-sm items-start" : "gap-xs items-start"}>
    <View className={welcome ? "pb-sm" : "pb-md"}>
      <Image
        accessible={false}
        className={welcome ? "h-18 w-[60.8541px]" : "h-10 w-[33.8645px]"}
        contentFit="contain"
        source={welcome ? welcomeMark : mark}
      />
    </View>
    {welcome ? (
      <H1 className="text-foreground">{title}</H1>
    ) : (
      <H2 className="text-foreground">{title}</H2>
    )}
    {description ? (
      <Text
        className={welcome ? "text-muted-foreground" : undefined}
        variant={welcome ? "default" : "muted"}
      >
        {description}
      </Text>
    ) : null}
  </View>
);
