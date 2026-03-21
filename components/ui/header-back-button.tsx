import React from "react";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";
import { Button } from "~/components/ui/button";
import { useRouter } from "expo-router";
import { Text } from "~/components/ui/text";

const HeaderBackButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ ...props }, ref) => {
  const router = useRouter();

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      onPress={() => router.back()}
      shape="pill"
      {...props}
    >
      <ArrowLeft size={21} className="text-foreground" />
    </Button>
  );
});

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
