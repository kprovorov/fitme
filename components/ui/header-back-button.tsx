import { useRouter } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";

const HeaderBackButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ ...props }, ref) => {
  const router = useRouter();

  return (
    <Button
      onPress={() => router.back()}
      ref={ref}
      shape="pill"
      size="icon-sm"
      variant="ghost"
      {...props}
    >
      <ArrowLeft className="text-foreground" size={21} />
    </Button>
  );
});

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
