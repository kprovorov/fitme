import { View } from "react-native";
import { Image } from "~/components/tw";
import { Text } from "~/components/ui/text";
import { H1, H2 } from "~/components/ui/typography";

export function AuthHeader({
  title,
  description,
  welcome = false,
}: {
  title: string;
  description?: string;
  welcome?: boolean;
}) {
  return (
    <View className={welcome ? "items-start gap-sm" : "items-start gap-xs"}>
      <View className={welcome ? "pb-sm" : "pb-md"}>
        <Image
          accessible={false}
          contentFit="contain"
          source={
            welcome
              ? require("~/assets/auth/mark-welcome.svg")
              : require("~/assets/auth/mark.svg")
          }
          style={
            welcome
              ? { height: 72, width: 60.8541 }
              : { height: 40, width: 33.8645 }
          }
        />
      </View>
      {welcome ? (
        <H1 className="text-foreground">{title}</H1>
      ) : (
        <H2 className="text-foreground">{title}</H2>
      )}
      {description ? (
        <Text
          className={
            welcome
              ? "text-body text-muted-foreground"
              : "text-muted-foreground text-subhead"
          }
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}
