import { useRouter } from "expo-router";
import type React from "react";
import { Button } from "~/components/ui/button";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";

const HeaderBackButton = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof Button> & {
  ref?: React.RefObject<React.ElementRef<typeof Button> | null>;
}) => {
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
};

HeaderBackButton.displayName = "HeaderBackButton";

export { HeaderBackButton };
