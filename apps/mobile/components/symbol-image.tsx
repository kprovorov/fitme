import {
  Image as ExpoImage,
  type ImageLoadEventData,
  type ImageProps,
} from "expo-image";
import { useCallback, useState } from "react";
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
 * An SF Symbol at the text style's point size, drawn at its own size (never
 * stretched, and a wide `dumbbell` keeps its width). Its box is as wide as the
 * symbol and exactly as tall as the style's line, so the symbol centers on the
 * text beside it and stacked symbols keep their labels in line (a symbol
 * taller than the line is scaled down to fit). A standalone `size` symbol's
 * box is at least `size` tall. Until the symbol has rendered (and on Android
 * and web, where SF Symbols don't exist and nothing is drawn) the box is a
 * point size wide.
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
  const textStyle = useResolveClassNames(classNames);
  const pointSize = size ?? (textStyle.fontSize as number | undefined);
  const lineHeight =
    size === undefined
      ? (textStyle.lineHeight as number | undefined)
      : undefined;
  const [symbolSize, setSymbolSize] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const handleLoad = useCallback(({ source }: ImageLoadEventData) => {
    setSymbolSize({ height: source.height, width: source.width });
  }, []);
  const box = pointSize
    ? {
        fontSize: pointSize,
        height: lineHeight ?? Math.max(symbolSize?.height ?? 0, pointSize),
        width: symbolSize?.width ?? pointSize,
      }
    : undefined;

  if (process.env.EXPO_OS !== "ios") {
    return <Placeholder className={className} style={box} />;
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
      className={classNames}
      contentFit="scale-down"
      onLoad={handleLoad}
      sfEffect={sfEffect}
      source={`sf:${name}`}
      style={box}
      transition={transition}
    />
  );
}
