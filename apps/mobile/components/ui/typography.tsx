import * as Slot from "@rn-primitives/slot";
import type { SlottableTextProps, TextRef } from "@rn-primitives/types";
import type * as React from "react";
import { Text as RNText } from "react-native";
import {
  ARIA_LEVEL,
  ROLE,
  TEXT_VARIANTS,
  type TextVariant,
} from "~/components/ui/text";
import { cn } from "~/lib/utils";

type TypographyProps = SlottableTextProps & {
  ref?: React.RefObject<TextRef | null>;
};

/**
 * One component per text variant, set in that variant's HIG style and color
 * from `TEXT_VARIANTS` (`H1` is Large Title, `H2` Title 1, `H3` Title 2, `H4`
 * Title 3). Headings carry the heading role and level for VoiceOver. Unlike
 * `Text`, these don't read `TextClassContext`, so an `H3` keeps its color
 * inside a `CardContent`.
 */
function typography(variant: TextVariant, displayName: string) {
  const Component = ({
    className,
    asChild = false,
    ref,
    ...props
  }: TypographyProps) => {
    const Root = asChild ? Slot.Text : RNText;
    return (
      <Root
        aria-level={ARIA_LEVEL[variant]}
        className={cn("web:select-text", TEXT_VARIANTS[variant], className)}
        ref={ref}
        role={ROLE[variant]}
        {...props}
      />
    );
  };
  Component.displayName = displayName;
  return Component;
}

const H1 = typography("h1", "H1");
const H2 = typography("h2", "H2");
const H3 = typography("h3", "H3");
const H4 = typography("h4", "H4");
const P = typography("p", "P");
const BlockQuote = typography("blockquote", "BlockQuote");
const Code = typography("code", "Code");
const Lead = typography("lead", "Lead");
const Large = typography("large", "Large");
const Small = typography("small", "Small");
const Muted = typography("muted", "Muted");

export { BlockQuote, Code, H1, H2, H3, H4, Large, Lead, Muted, P, Small };
