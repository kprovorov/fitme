import { Image as ExpoImage, type ImageProps } from "expo-image";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { useResolveClassNames, withUniwind } from "uniwind";
import { cn } from "~/lib/utils";

const Image = withUniwind(ExpoImage);
const Placeholder = withUniwind(View);

interface SymbolImageProps {
  /** VoiceOver label, for a symbol that says something on its own. */
  accessibilityLabel?: string;
  /**
   * The text style and color of the text the symbol sits next to
   * (`text-footnote text-muted-foreground`): the symbol takes the style's
   * point size and weight and the color. Without a text style it's Body.
   * Layout classes (`shrink-0`, `mt-1`) go here too.
   */
  className?: string;
  name: SFSymbol;
  sfEffect?: ImageProps["sfEffect"];
  /**
   * Point size, for a symbol that stands alone rather than next to text (an
   * empty state's illustration). Takes precedence over the text style's size.
   */
  size?: number;
  transition?: ImageProps["transition"];
}

/**
 * An SF Symbol. Symbols only exist on Apple platforms, so on Android and web
 * the symbol's box stays empty: the layout holds, nothing is drawn.
 */
export function SymbolImage({
  accessibilityLabel,
  className,
  name,
  sfEffect,
  size,
  transition,
}: SymbolImageProps) {
  const classNames = cn("text-body", className);
  const textSize = useResolveClassNames(classNames).fontSize as
    | number
    | undefined;
  const pointSize = size ?? textSize;
  const box = pointSize
    ? { fontSize: pointSize, height: pointSize, width: pointSize }
    : undefined;

  if (process.env.EXPO_OS !== "ios") {
    return <Placeholder className={className} style={box} />;
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
      className={classNames}
      sfEffect={sfEffect}
      source={`sf:${name}`}
      style={box}
      transition={transition}
    />
  );
}
