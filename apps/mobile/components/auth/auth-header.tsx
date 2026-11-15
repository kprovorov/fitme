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

/**
 * An auth Screen's heading: the Fitme mark (left out with `mark={false}`,
 * on a signed-in User's account Screens), the title and its description.
 */
export const AuthHeader = ({
  title,
  description,
  mark: showMark = true,
  welcome = false,
}: {
  title: string;
  description?: string;
  mark?: boolean;
  welcome?: boolean;
}) => (
  <View className={welcome ? "gap-sm items-start" : "gap-xs items-start"}>
    {showMark ? (
      <View className={welcome ? "pb-sm" : "pb-md"}>
        <Image
          accessible={false}
          className={welcome ? "h-18 w-[60.8541px]" : "h-10 w-[33.8645px]"}
          contentFit="contain"
          source={welcome ? welcomeMark : mark}
        />
      </View>
    ) : null}
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
