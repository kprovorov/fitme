import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Button, type ButtonProps } from "~/components/ui/button";

const HeaderBackButton = (props: Omit<ButtonProps, "systemImage">) => {
  const router = useRouter();
  const goBack = useCallback(() => router.back(), [router]);

  return (
    <Button
      onPress={goBack}
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
