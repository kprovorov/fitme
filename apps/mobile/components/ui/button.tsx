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
  buttonBorderShape,
  buttonStyle,
  contentShape,
  controlSize,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
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
  NATIVE_CIRCLE_ENABLED,
  SwiftUIHost,
  useSwiftUIFont,
  useSwiftUITheme,
} from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

type ButtonVariant = "default" | "secondary" | "destructive" | "ghost";

type ButtonSize = "sm" | "default" | "lg";

type ButtonShape = "pill" | "circle";

type ButtonIconPosition = "leading" | "trailing";

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
  secondary: "glass",
};

/** Pre-iOS 26 equivalents. */
const SOLID_BUTTON_STYLE: Record<ButtonVariant, SwiftUIButtonStyle> = {
  default: "borderedProminent",
  destructive: "borderedProminent",
  ghost: "plain",
  secondary: "bordered",
};

const SWIFT_UI_CONTROL_SIZE: Record<
  ButtonSize,
  "mini" | "small" | "regular" | "large" | "extraLarge"
> = {
  default: "large",
  lg: "extraLarge",
  sm: "small",
};

/**
 * Each size's label in its Emphasized HIG text style. The icon is drawn at
 * the same point size.
 */
const LABEL_FONT_CLASS: Record<ButtonSize, string> = {
  default: "text-body-emphasized",
  lg: "text-title-3-emphasized",
  sm: "text-subhead-emphasized",
};

/**
 * The native height of each size (`--size-button-*`): a pill's height, a
 * circle's diameter. Native styles size themselves; a ghost button has no
 * style to do it, so it takes the token and lines up with its siblings.
 */
const SIZE_CLASS: Record<ButtonShape, Record<ButtonSize, string>> = {
  circle: {
    default: "size-button-circle-default",
    lg: "size-button-circle-lg",
    sm: "size-button-circle-sm",
  },
  pill: {
    default: "size-button-pill-default",
    lg: "size-button-pill-lg",
    sm: "size-button-pill-sm",
  },
};

/**
 * Gap between a button's label and its icon: `--spacing-xs`. SwiftUI's
 * `spacing` takes a number, so this mirrors the token (Figma binds the same
 * gap to `Spacing/xs`).
 */
const ICON_LABEL_SPACING = 8;

interface ButtonBaseProps {
  /** Hint read by VoiceOver after the label, describing what a tap does. */
  accessibilityHint?: string;
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
  onPress?: () => void;
  size?: ButtonSize;
  testID?: string;
  variant?: ButtonVariant;
}

/** A capsule with a label, and optionally an icon before or after it. */
interface PillBaseProps extends ButtonBaseProps {
  /** VoiceOver label, when the visible one doesn't say enough. */
  accessibilityLabel?: string;
  /** SF Symbol drawn next to the label. */
  icon?: SFSymbol;
  iconPosition?: ButtonIconPosition;
  shape?: "pill";
}

/**
 * A pill always has something to read: a `label`, or `children` (the older
 * form: text, or views when there's no SF Symbol). A lone icon is a circle.
 */
type PillButtonProps = PillBaseProps &
  (
    | {
        children?: React.ReactNode;
        /** Button text. Takes precedence over `children`. */
        label: string;
      }
    | {
        children: Exclude<React.ReactNode, null | undefined | boolean>;
        label?: undefined;
      }
  );

/** An icon on its own. It has no visible text, so VoiceOver needs a label. */
interface CircleButtonProps extends ButtonBaseProps {
  accessibilityLabel: string;
  children?: never;
  /** SF Symbol, the circle's only content. */
  icon: SFSymbol;
  iconPosition?: never;
  label?: never;
  shape: "circle";
}

type ButtonProps = PillButtonProps | CircleButtonProps;

/**
 * The label and icon color: `colorClassName`'s when given, else the
 * variant's. SwiftUI's prominent button styles force a white label; the app's
 * lime primary needs a dark one, so the content always states its own color.
 */
function useContentColor(
  variant: ButtonVariant,
  colorClassName: string | undefined
): string {
  const theme = useSwiftUITheme();
  const override = useResolveClassNames(colorClassName ?? "").color as
    | string
    | undefined;
  return (
    override ??
    {
      default: theme.primaryForeground,
      destructive: theme.destructiveForeground,
      ghost: theme.foreground,
      secondary: theme.secondaryForeground,
    }[variant]
  );
}

/** The button's own modifiers: native style, shape, size, state and labels. */
function buttonModifiers({
  accessibilityHint,
  accessibilityLabel,
  disabled,
  isCircle,
  paintsCircle,
  size,
  tintColor,
  variant,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled: boolean;
  isCircle: boolean;
  paintsCircle: boolean;
  size: ButtonSize;
  tintColor: string;
  variant: ButtonVariant;
}): ViewModifier[] {
  const styles = GLASS_ENABLED ? GLASS_BUTTON_STYLE : SOLID_BUTTON_STYLE;
  // A painted circle draws its own fill, so the button itself stays plain.
  const style = paintsCircle
    ? buttonStyle("plain")
    : buttonStyle(styles[variant]);
  return [
    style,
    ...(paintsCircle
      ? []
      : [buttonBorderShape(isCircle ? "circle" : "capsule")]),
    controlSize(SWIFT_UI_CONTROL_SIZE[size]),
    tint(tintColor),
    ...(disabled ? [disabledModifier(true)] : []),
    ...(accessibilityLabel
      ? [accessibilityLabelModifier(accessibilityLabel)]
      : []),
    ...(accessibilityHint
      ? [accessibilityHintModifier(accessibilityHint)]
      : []),
  ];
}

/**
 * Sizes the content where no native style does. A ghost button has no style to
 * give it a height, so it takes the native one from the token, and the whole
 * box is tappable. Below iOS 17 a circle can't get its shape from the style,
 * so it's framed at the token's diameter and paints its own circle (`fill`;
 * none for ghost). Other buttons need nothing.
 */
function frameModifiers({
  fill,
  isCircle,
  nativeHeight,
  paintsCircle,
  variant,
}: {
  fill: string | undefined;
  isCircle: boolean;
  nativeHeight: number | undefined;
  paintsCircle: boolean;
  variant: ButtonVariant;
}): ViewModifier[] {
  if (nativeHeight === undefined || !(paintsCircle || variant === "ghost")) {
    return [];
  }
  return isCircle
    ? [
        frame({ height: nativeHeight, width: nativeHeight }),
        ...(fill ? [background(fill, shapes.circle())] : []),
        contentShape(shapes.circle()),
      ]
    : [frame({ minHeight: nativeHeight }), contentShape(shapes.capsule())];
}

const Button = (props: ButtonProps) => {
  const {
    accessibilityHint,
    accessibilityLabel,
    children,
    className,
    contentColorClassName,
    disabled = false,
    fill,
    icon,
    iconPosition = "leading",
    isLoading = false,
    label: labelProp,
    onPress,
    shape = "pill",
    size = "default",
    testID,
    variant = "default",
  } = props;
  const isCircle = shape === "circle";
  const paintsCircle = isCircle && !NATIVE_CIRCLE_ENABLED;

  const theme = useSwiftUITheme();
  const labelFont = useSwiftUIFont(LABEL_FONT_CLASS[size]);
  const nativeHeight = useResolveClassNames(SIZE_CLASS[shape][size]).height as
    | number
    | undefined;
  const contentColor = useContentColor(variant, contentColorClassName);

  // Circles and ghost buttons sit inline; everything else fills, as the
  // previous NativeWind button did inside a stretching container.
  const stretch =
    fill ??
    (!(isCircle || variant === "ghost") || isStretchClassName(className));

  // Prominent styles fill with the tint. The regular styles only use it for
  // their translucent fill, which `foreground` keeps a neutral grey.
  const tintColor = {
    default: theme.primary,
    destructive: theme.destructive,
    ghost: theme.foreground,
    secondary: theme.foreground,
  }[variant];

  const modifiers = buttonModifiers({
    accessibilityHint,
    accessibilityLabel,
    disabled: disabled || isLoading,
    isCircle,
    paintsCircle,
    size,
    tintColor,
    variant,
  });

  const role: ButtonRole =
    variant === "destructive" ? "destructive" : "default";

  // A circle shows only its icon, whatever the props say.
  const label = isCircle ? null : (labelProp ?? childrenToLabel(children));

  // A button style draws its background around the label, so the label — not
  // the button — is what has to span the full width. An inline button, by
  // contrast, sits in a host that starts at zero width, and SwiftUI would
  // truncate the label to fit that proposal; `fixedSize` keeps the label at
  // its natural width so the host can grow around it.
  const contentFrame: ViewModifier[] = stretch
    ? [frame({ maxWidth: FILL })]
    : [fixedSize({ horizontal: true })];

  const sizeFrame = frameModifiers({
    // A painted circle's fill: the solid style's, as there's no glass below
    // iOS 17.
    fill: {
      default: theme.primary,
      destructive: theme.destructive,
      ghost: undefined,
      secondary: theme.secondary,
    }[variant],
    isCircle,
    nativeHeight,
    paintsCircle,
    variant,
  });

  const iconView = icon ? (
    <SwiftUIImage
      color={contentColor}
      size={labelFont.size}
      systemName={icon}
    />
  ) : null;

  const renderLabel = () => {
    if (isCircle) {
      return <HStack modifiers={sizeFrame}>{iconView}</HStack>;
    }

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

      // SwiftUI's `Label` is always icon-first, so the row is laid out by
      // hand to put the icon on either side.
      return (
        <HStack
          modifiers={[...contentFrame, ...sizeFrame]}
          spacing={ICON_LABEL_SPACING}
        >
          {iconPosition === "leading" ? iconView : null}
          {labelText}
          {iconPosition === "trailing" ? iconView : null}
        </HStack>
      );
    }

    if (children) {
      const hosted = (
        <RNHostView matchContents>
          <View className="flex-row items-center gap-2">{children}</View>
        </RNHostView>
      );
      return sizeFrame.length > 0 ? (
        <HStack modifiers={sizeFrame}>{hosted}</HStack>
      ) : (
        hosted
      );
    }

    return (
      <HStack modifiers={[...contentFrame, ...sizeFrame]}>{iconView}</HStack>
    );
  };

  const renderContent = () => {
    if (!isLoading) {
      return renderLabel();
    }

    // A loading button is also disabled, which greys out its fill, so the
    // spinner uses the brand green rather than the label color. A spinner is
    // its own size, so a zero frame keeps it out of the layout: it draws
    // centered over the content without growing the button.
    const spinner = (
      <ProgressView
        modifiers={[
          frame({ height: 0, width: 0 }),
          controlSize(size === "sm" ? "small" : "regular"),
          tint(theme.primary),
        ]}
      />
    );

    // Keeping the content in the layout — just invisible — holds the button
    // at exactly the size it has when idle. A painted circle keeps its fill
    // visible: the frame and circle go on the stack, only the icon hides.
    if (paintsCircle) {
      return (
        <ZStack modifiers={sizeFrame}>
          <Group modifiers={[opacity(0)]}>{iconView}</Group>
          {spinner}
        </ZStack>
      );
    }

    return (
      <ZStack modifiers={isCircle ? [] : contentFrame}>
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

export type {
  ButtonIconPosition,
  ButtonProps,
  ButtonShape,
  ButtonSize,
  ButtonVariant,
  CircleButtonProps,
  PillButtonProps,
};
export { Button };
