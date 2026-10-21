import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Button, type CircleButtonProps } from "~/components/ui/button";

type HeaderBackButtonProps = Partial<Omit<CircleButtonProps, "icon" | "shape">>;

const HeaderBackButton = (props: HeaderBackButtonProps) => {
  const router = useRouter();
  const goBack = useCallback(() => router.back(), [router]);

  return (
    <Button
      accessibilityLabel="Back"
      icon="arrow.left"
      onPress={goBack}
      shape="circle"
      variant="ghost"
      {...props}
    />
  );
};

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
