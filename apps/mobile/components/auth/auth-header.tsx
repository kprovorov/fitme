import { View } from "react-native";

import { Image } from "~/components/image";
import { Text } from "~/components/ui/text";
import { H1, H2 } from "~/components/ui/typography";

// SAFETY: Metro resolves this static asset to its numeric asset registry id.
// oxlint-disable-next-line unicorn/prefer-module, node/global-require -- Metro requires a static asset require.
const welcomeMark = require("~/assets/auth/mark-welcome.svg") as number;

// SAFETY: Metro resolves this static asset to its numeric asset registry id.
// oxlint-disable-next-line unicorn/prefer-module, node/global-require -- Metro requires a static asset require.
const mark = require("~/assets/auth/mark.svg") as number;

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
