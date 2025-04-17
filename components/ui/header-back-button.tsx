import React from "react";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";
import { Button } from "~/components/ui/button";
import { useRouter } from "expo-router";
import { cn } from "~/lib/utils";

const HeaderBackButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ ...props }, ref) => {
  const router = useRouter();

  return (
    <Button
      ref={ref}
      variant="secondary"
      size="icon-sm"
      onPress={() => router.back()}
      className={cn("rounded-full active:opacity-80", props.className)}
      {...props}
    >
      <ArrowLeft size={16} className="text-white" />
    </Button>
  );
});

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
