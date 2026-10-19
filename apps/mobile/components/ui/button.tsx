import {
  type ButtonRole,
  Group,
  HStack,
  ProgressView,
  RNHostView,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
  Text as SwiftUIText,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityHint as accessibilityHintModifier,
  accessibilityLabel as accessibilityLabelModifier,
  background,
  buttonStyle,
  clipShape,
  controlSize,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  opacity,
  shapes,
  tint,
  type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { useResolveClassNames } from "uniwind";
import {
  childrenToLabel,
  FILL,
  GLASS_ENABLED,
  isStretchClassName,
  SwiftUIHost,
  useSwiftUIFont,
  useSwiftUITheme,
} from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

type ButtonSize = "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-xs";

type ButtonShape = "pill" | "default";

type SwiftUIButtonStyle =
  | "borderedProminent"
  | "bordered"
  | "plain"
  | "glass"
  | "glassProminent";

/** Liquid Glass styling, used when the OS supports it. */
const GLASS_BUTTON_STYLE: Record<ButtonVariant, SwiftUIButtonStyle> = {
  default: "glassProminent",
  destructive: "glassProminent",
  ghost: "plain",
  link: "plain",
  outline: "glass",
  secondary: "glass",
};

/** Pre-iOS 26 equivalents. */
const SOLID_BUTTON_STYLE: Record<ButtonVariant, SwiftUIButtonStyle> = {
  default: "borderedProminent",
  destructive: "borderedProminent",
  ghost: "plain",
  link: "plain",
  outline: "bordered",
  secondary: "bordered",
};

const BUTTON_STYLE = GLASS_ENABLED ? GLASS_BUTTON_STYLE : SOLID_BUTTON_STYLE;

const SWIFT_UI_CONTROL_SIZE: Record<
  ButtonSize,
  "mini" | "small" | "regular" | "large"
> = {
  default: "large",
  icon: "regular",
  "icon-sm": "small",
  "icon-xs": "mini",
  lg: "large",
  sm: "small",
};

/** Icon buttons hug their glyph; every other size spans the width it's given. */
const ICON_SIZES: ButtonSize[] = ["icon", "icon-sm", "icon-xs"];

/** Brand type scale per size, mirroring the previous NativeWind text variants. */
const LABEL_FONT_CLASS: Record<ButtonSize, string> = {
  default: "font-nunito-sans-bold text-body",
  icon: "font-nunito-sans-bold text-body",
  "icon-sm": "font-nunito-sans-bold text-subhead",
  "icon-xs": "font-nunito-sans-bold text-footnote",
  lg: "font-nunito-sans-bold text-title-3",
  sm: "font-nunito-sans-bold text-subhead",
};

/** Glyph point sizes for icon-only buttons. */
const ICON_GLYPH_SIZE: Record<ButtonSize, number> = {
  default: 17,
  icon: 24,
  "icon-sm": 21,
  "icon-xs": 16,
  lg: 20,
  sm: 16,
};

/** Gap between a button's label and its trailing icon. */
const ICON_LABEL_SPACING = 8;

/** Tap-target diameter for circular icon buttons, matching the old h-10/9/8. */
const ICON_DIAMETER: Record<ButtonSize, number> = {
  default: 40,
  icon: 40,
  "icon-sm": 36,
  "icon-xs": 32,
  lg: 44,
  sm: 36,
};

interface ButtonProps {
  /** Hint read by VoiceOver after the label, describing what a tap does. */
  accessibilityHint?: string;
  /** VoiceOver label; required for icon-only buttons, which have no text. */
  accessibilityLabel?: string;
  children?: React.ReactNode;
  className?: string;
  /**
   * A text color class (`text-primary`) for the label and icon, in place of
   * the variant's own.
   */
  contentColorClassName?: string;
  disabled?: boolean;
  /** Overrides whether the button spans its container's width. */
  fill?: boolean;
  /** Swaps the button's content for a native spinner. */
  isLoading?: boolean;
  /** Button text. Takes precedence over `children`. */
  label?: string;
  onPress?: () => void;
  /** `pill` gives a capsule, or a circle when paired with an icon size. */
  shape?: ButtonShape | null;
  size?: ButtonSize | null;
  /** SF Symbol rendered next to the label, or on its own for icon buttons. */
  systemImage?: SFSymbol;
  testID?: string;
  variant?: ButtonVariant | null;
}

const Button = ({
  accessibilityHint,
  accessibilityLabel,
  className,
  contentColorClassName,
  variant = "default",
  size = "default",
  shape = "default",
  disabled,
  onPress,
  label: labelProp,
  systemImage,
  isLoading = false,
  fill,
  testID,
  children,
}: ButtonProps) => {
  const theme = useSwiftUITheme();
  const contentOverride = useResolveClassNames(contentColorClassName ?? "")
    .color as string | undefined;

  const resolvedVariant = variant ?? "default";
  const resolvedSize = size ?? "default";
  const labelFont = useSwiftUIFont(LABEL_FONT_CLASS[resolvedSize]);
  const isIcon = ICON_SIZES.includes(resolvedSize);

  // Icon and link buttons sit inline; everything else fills, as the previous
  // NativeWind button did inside a stretching container.
  const stretch =
    fill ??
    (!(isIcon || resolvedVariant === "link") || isStretchClassName(className));

  const tintColor = {
    default: theme.primary,
    destructive: theme.destructive,
    ghost: theme.foreground,
    link: theme.primary,
    outline: theme.foreground,
    secondary: theme.secondary,
  }[resolvedVariant];

  // A round icon button can't come from `buttonStyle`, whose padding is wider
  // than it is tall. Painting a circle behind a square-framed glyph instead is
  // the only way to guarantee the shape.
  const isCircular = isIcon && shape === "pill";

  const circleFill = {
    default: theme.primary,
    destructive: theme.destructive,
    ghost: undefined,
    link: undefined,
    outline: undefined,
    secondary: theme.secondary,
  }[resolvedVariant];

  // SwiftUI's prominent button styles force a white label; the app's lime
  // primary needs a dark one, so the content always states its own color.
  const contentColor =
    contentOverride ??
    {
      default: theme.primaryForeground,
      destructive: theme.destructiveForeground,
      ghost: theme.foreground,
      link: theme.primary,
      outline: theme.foreground,
      secondary: theme.secondaryForeground,
    }[resolvedVariant];

  const modifiers: ViewModifier[] = [
    buttonStyle(isCircular ? "plain" : BUTTON_STYLE[resolvedVariant]),
    controlSize(SWIFT_UI_CONTROL_SIZE[resolvedSize]),
    tint(tintColor),
  ];

  // Glass buttons are already capsules on iOS 26, and clipping them would cut
  // off the effect's edge lighting.
  if (shape === "pill" && !(isCircular || GLASS_ENABLED)) {
    modifiers.push(clipShape("capsule"));
  }

  if (disabled || isLoading) {
    modifiers.push(disabledModifier(true));
  }

  if (accessibilityLabel) {
    modifiers.push(accessibilityLabelModifier(accessibilityLabel));
  }

  if (accessibilityHint) {
    modifiers.push(accessibilityHintModifier(accessibilityHint));
  }

  const role: ButtonRole =
    resolvedVariant === "destructive" ? "destructive" : "default";

  const label = labelProp ?? childrenToLabel(children);

  // A button style draws its background around the label, so the label — not
  // the button — is what has to span the full width. An inline button, by
  // contrast, sits in a host that starts at zero width, and SwiftUI would
  // truncate the label to fit that proposal; `fixedSize` keeps the label at
  // its natural width so the host can grow around it.
  const contentFrame: ViewModifier[] = stretch
    ? [frame({ maxWidth: FILL })]
    : [fixedSize({ horizontal: true })];

  // Circular buttons opt out of the button style, so they draw their own fill:
  // a glass circle where the OS supports it, a solid one otherwise.
  const circleModifiers = (): ViewModifier[] => {
    const diameter = ICON_DIAMETER[resolvedSize];
    const shapeFrame = frame({ height: diameter, width: diameter });

    if (GLASS_ENABLED) {
      return [
        shapeFrame,
        glassEffect({
          glass: {
            interactive: true,
            tint: circleFill,
            variant: "regular",
          },
          shape: "circle",
        }),
      ];
    }

    return circleFill
      ? [shapeFrame, background(circleFill, shapes.circle())]
      : [shapeFrame];
  };

  const renderLabel = () => {
    if (label !== null) {
      const labelText = (
        <SwiftUIText
          modifiers={[
            font({ family: labelFont.family, size: labelFont.size }),
            foregroundStyle(contentColor),
          ]}
        >
          {label}
        </SwiftUIText>
      );

      if (!systemImage) {
        return contentFrame.length > 0 ? (
          <HStack modifiers={contentFrame}>{labelText}</HStack>
        ) : (
          labelText
        );
      }

      // SwiftUI's `Label` is always icon-first, so a trailing icon has to be
      // laid out by hand.
      return (
        <HStack modifiers={contentFrame} spacing={ICON_LABEL_SPACING}>
          {labelText}
          <SwiftUIImage
            color={contentColor}
            size={labelFont.size ?? ICON_GLYPH_SIZE[resolvedSize]}
            systemName={systemImage}
          />
        </HStack>
      );
    }
    if (systemImage) {
      return (
        <SwiftUIImage
          color={contentColor}
          modifiers={isCircular ? circleModifiers() : undefined}
          size={ICON_GLYPH_SIZE[resolvedSize]}
          systemName={systemImage}
        />
      );
    }
    if (children) {
      return (
        <RNHostView matchContents>
          <View className="flex-row items-center gap-2">{children}</View>
        </RNHostView>
      );
    }
  };

  const renderContent = () => {
    if (!isLoading) {
      return renderLabel();
    }

    // A loading button is also disabled, which greys out its fill, so the
    // spinner uses the brand green rather than the label color.
    const spinner = <ProgressView modifiers={[tint(theme.primary)]} />;

    if (label === null) {
      return spinner;
    }

    // A spinner is smaller than the label it replaces, so the button would
    // shrink around it. Keeping the label in the layout — just invisible —
    // holds the button at exactly the size it has when idle.
    return (
      <ZStack modifiers={contentFrame}>
        <Group modifiers={[opacity(0)]}>{renderLabel()}</Group>
        {spinner}
      </ZStack>
    );
  };

  return (
    <SwiftUIHost
      className={cn(stretch && "w-full", className)}
      matchContents={stretch ? { vertical: true } : true}
    >
      <SwiftUIButton
        modifiers={modifiers}
        onPress={onPress}
        role={role}
        testID={testID}
      >
        {renderContent()}
      </SwiftUIButton>
    </SwiftUIHost>
  );
};

Button.displayName = "Button";

export type { ButtonProps, ButtonSize, ButtonVariant };
export { Button };
