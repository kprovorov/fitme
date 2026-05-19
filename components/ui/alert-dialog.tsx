import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import type * as React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { buttonTextVariants, buttonVariants } from "~/components/ui/button";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlayWeb = ({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.OverlayProps & {
  ref?: React.RefObject<AlertDialogPrimitive.OverlayRef | null>;
}) => {
  const { open } = AlertDialogPrimitive.useRootContext();
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "absolute top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center bg-black/80 p-2",
        open
          ? "web:fade-in-0 web:animate-in"
          : "web:fade-out-0 web:animate-out",
        className
      )}
      {...props}
      ref={ref}
    />
  );
};

AlertDialogOverlayWeb.displayName = "AlertDialogOverlayWeb";

const AlertDialogOverlayNative = ({
  className,
  children,
  ref,
  ...props
}: AlertDialogPrimitive.OverlayProps & {
  ref?: React.RefObject<AlertDialogPrimitive.OverlayRef | null>;
}) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "z-50 flex items-center justify-center bg-black/80 p-2",
      className
    )}
    style={StyleSheet.absoluteFill}
    {...props}
    asChild
    ref={ref}
  >
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
    >
      {children}
    </Animated.View>
  </AlertDialogPrimitive.Overlay>
);

AlertDialogOverlayNative.displayName = "AlertDialogOverlayNative";

const AlertDialogOverlay = Platform.select({
  web: AlertDialogOverlayWeb,
  default: AlertDialogOverlayNative,
});

const AlertDialogContent = ({
  className,
  portalHost,
  ref,
  ...props
}: (AlertDialogPrimitive.ContentProps & { portalHost?: string }) & {
  ref?: React.RefObject<AlertDialogPrimitive.ContentRef | null>;
}) => {
  const { open } = AlertDialogPrimitive.useRootContext();

  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn(
            "z-50 max-w-lg gap-4 rounded-lg border border-border bg-background p-6 shadow-foreground/10 shadow-lg web:duration-200",
            open
              ? "web:fade-in-0 web:zoom-in-95 web:animate-in"
              : "web:fade-out-0 web:zoom-out-95 web:animate-out",
            className
          )}
          ref={ref}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
};
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }: ViewProps) => (
  <View className={cn("flex flex-col gap-2", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: ViewProps) => (
  <View
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = ({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.TitleProps & {
  ref?: React.RefObject<AlertDialogPrimitive.TitleRef | null>;
}) => (
  <AlertDialogPrimitive.Title
    className={cn(
      "font-semibold native:text-xl text-foreground text-lg",
      className
    )}
    ref={ref}
    {...props}
  />
);
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = ({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.DescriptionProps & {
  ref?: React.RefObject<AlertDialogPrimitive.DescriptionRef | null>;
}) => (
  <AlertDialogPrimitive.Description
    className={cn("native:text-base text-muted-foreground text-sm", className)}
    ref={ref}
    {...props}
  />
);
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = ({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.ActionProps & {
  ref?: React.RefObject<AlertDialogPrimitive.ActionRef | null>;
}) => (
  <TextClassContext.Provider value={buttonTextVariants({ className })}>
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      ref={ref}
      {...props}
    />
  </TextClassContext.Provider>
);
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = ({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.CancelProps & {
  ref?: React.RefObject<AlertDialogPrimitive.CancelRef | null>;
}) => (
  <TextClassContext.Provider
    value={buttonTextVariants({ className, variant: "outline" })}
  >
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline", className }))}
      ref={ref}
      {...props}
    />
  </TextClassContext.Provider>
);
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
