import * as Slot from "@rn-primitives/slot";
import type { SlottableTextProps, TextRef } from "@rn-primitives/types";
import type * as React from "react";
import { Platform, Text as RNText } from "react-native";
import { cn } from "~/lib/utils";

const H1 = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      aria-level="1"
      className={cn(
        "web:select-text web:scroll-m-20 font-nunito-sans-bold text-3xl text-primary tracking-tight lg:text-4xl",
        className
      )}
      ref={ref}
      role="heading"
      {...props}
    />
  );
};

H1.displayName = "H1";

const H2 = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      aria-level="2"
      className={cn(
        "web:select-text web:scroll-m-20 font-nunito-sans-bold text-2xl text-primary tracking-tight first:mt-0",
        className
      )}
      ref={ref}
      role="heading"
      {...props}
    />
  );
};

H2.displayName = "H2";

const H3 = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      aria-level="3"
      className={cn(
        "web:select-text web:scroll-m-20 font-nunito-sans-bold text-foreground text-xl tracking-tight",
        className
      )}
      ref={ref}
      role="heading"
      {...props}
    />
  );
};

H3.displayName = "H3";

const H4 = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      aria-level="4"
      className={cn(
        "web:select-text web:scroll-m-20 font-nunito-sans-semibold text-foreground text-lg tracking-tight",
        className
      )}
      ref={ref}
      role="heading"
      {...props}
    />
  );
};

H4.displayName = "H4";

const P = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "web:select-text font-nunito-sans-regular text-base text-foreground",
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

P.displayName = "P";

const BlockQuote = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "mt-6 native:mt-4 web:select-text border-border border-l-2 native:pl-3 pl-6 text-base text-foreground italic",
        className
      )}
      ref={ref}
      // @ts-expect-error - role of blockquote renders blockquote element on the web
      role={Platform.OS === "web" ? "blockquote" : undefined}
      {...props}
    />
  );
};

BlockQuote.displayName = "BlockQuote";

const Code = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "relative web:select-text rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-semibold text-foreground text-sm",
        className
      )}
      ref={ref}
      // @ts-expect-error - role of code renders code element on the web
      role={Platform.OS === "web" ? "code" : undefined}
      {...props}
    />
  );
};

Code.displayName = "Code";

const Lead = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn("web:select-text text-muted-foreground text-xl", className)}
      ref={ref}
      {...props}
    />
  );
};

Lead.displayName = "Lead";

const Large = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "web:select-text font-nunito-sans-semibold text-foreground text-xl",
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

Large.displayName = "Large";

const Small = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "web:select-text font-nunito-sans-semibold text-foreground text-sm leading-none",
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

Small.displayName = "Small";

const Muted = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "web:select-text font-nunito-sans-regular text-muted-foreground text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
};

Muted.displayName = "Muted";

export { BlockQuote, Code, H1, H2, H3, H4, Large, Lead, Muted, P, Small };
