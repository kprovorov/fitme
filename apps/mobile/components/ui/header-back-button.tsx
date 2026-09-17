import { useRouter } from "expo-router";
import { Button, type ButtonProps } from "~/components/ui/button";

const HeaderBackButton = (props: Omit<ButtonProps, "systemImage">) => {
  const router = useRouter();

  return (
    <Button
      onPress={() => router.back()}
      shape="pill"
      size="icon-sm"
      systemImage="arrow.left"
      variant="ghost"
      {...props}
    />
  );
};

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
