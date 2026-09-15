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
  background,
  buttonStyle,
  clipShape,
  controlSize,
  disabled as disabledModifier,
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
  outline: "glass",
  secondary: "glass",
  ghost: "plain",
  link: "plain",
};

/** Pre-iOS 26 equivalents. */
const SOLID_BUTTON_STYLE: Record<ButtonVariant, SwiftUIButtonStyle> = {
  default: "borderedProminent",
  destructive: "borderedProminent",
  outline: "bordered",
  secondary: "bordered",
  ghost: "plain",
  link: "plain",
};

const BUTTON_STYLE = GLASS_ENABLED ? GLASS_BUTTON_STYLE : SOLID_BUTTON_STYLE;

const SWIFT_UI_CONTROL_SIZE: Record<
  ButtonSize,
  "mini" | "small" | "regular" | "large"
> = {
  sm: "small",
  default: "large",
  lg: "large",
  icon: "regular",
  "icon-sm": "small",
  "icon-xs": "mini",
};

/** Icon buttons hug their glyph; every other size spans the width it's given. */
const ICON_SIZES: ButtonSize[] = ["icon", "icon-sm", "icon-xs"];

/** Brand type scale per size, mirroring the previous NativeWind text variants. */
const LABEL_FONT_CLASS: Record<ButtonSize, string> = {
  sm: "font-nunito-sans-bold text-subhead",
  default: "font-nunito-sans-bold text-body",
  lg: "font-nunito-sans-bold text-title-3",
  icon: "font-nunito-sans-bold text-body",
  "icon-sm": "font-nunito-sans-bold text-subhead",
  "icon-xs": "font-nunito-sans-bold text-footnote",
};

/** Glyph point sizes for icon-only buttons. */
const ICON_GLYPH_SIZE: Record<ButtonSize, number> = {
  sm: 16,
  default: 17,
  lg: 20,
  icon: 24,
  "icon-sm": 21,
  "icon-xs": 16,
};

/** Gap between a button's label and its trailing icon. */
const ICON_LABEL_SPACING = 8;

/** Tap-target diameter for circular icon buttons, matching the old h-10/9/8. */
const ICON_DIAMETER: Record<ButtonSize, number> = {
  sm: 36,
  default: 40,
  lg: 44,
  icon: 40,
  "icon-sm": 36,
  "icon-xs": 32,
};

interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
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
  className,
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
    outline: theme.foreground,
    secondary: theme.secondary,
    ghost: theme.foreground,
    link: theme.primary,
  }[resolvedVariant];

  // A round icon button can't come from `buttonStyle`, whose padding is wider
  // than it is tall. Painting a circle behind a square-framed glyph instead is
  // the only way to guarantee the shape.
  const isCircular = isIcon && shape === "pill";

  const circleFill = {
    default: theme.primary,
    destructive: theme.destructive,
    secondary: theme.secondary,
    outline: undefined,
    ghost: undefined,
    link: undefined,
  }[resolvedVariant];

  // SwiftUI's prominent button styles force a white label; the app's lime
  // primary needs a dark one, so the content always states its own color.
  const contentColor = {
    default: theme.primaryForeground,
    destructive: theme.destructiveForeground,
    outline: theme.foreground,
    secondary: theme.secondaryForeground,
    ghost: theme.foreground,
    link: theme.primary,
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

  const role: ButtonRole =
    resolvedVariant === "destructive" ? "destructive" : "default";

  const label = labelProp ?? childrenToLabel(children);

  // A button style draws its background around the label, so the label — not
  // the button — is what has to span the full width.
  const contentFrame: ViewModifier[] = stretch
    ? [frame({ maxWidth: FILL })]
    : [];

  // Circular buttons opt out of the button style, so they draw their own fill:
  // a glass circle where the OS supports it, a solid one otherwise.
  const circleModifiers = (): ViewModifier[] => {
    const diameter = ICON_DIAMETER[resolvedSize];
    const shapeFrame = frame({ width: diameter, height: diameter });

    if (GLASS_ENABLED) {
      return [
        shapeFrame,
        glassEffect({
          glass: {
            variant: "regular",
            interactive: true,
            tint: circleFill,
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
    return;
  };

  const renderContent = () => {
    if (!isLoading) {
      return renderLabel();
    }

    const spinner = <ProgressView modifiers={[tint(contentColor)]} />;

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
