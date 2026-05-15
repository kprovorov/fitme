import {
  Image as ExpoImage,
  type ImageProps,
  type ImageStyle,
} from "expo-image";
import {
  ArrowUp,
  ChevronDown,
  HelpCircle,
  type LucideIcon,
  MessageSquare,
  Plus,
} from "lucide-react-native";

import { withUniwind } from "uniwind";

const Image = withUniwind(ExpoImage);

/**
 * Map of SF Symbol names to Lucide icons for Android/web fallback.
 */
const LUCIDE_FALLBACKS: Record<string, LucideIcon> = {
  "arrow.up": ArrowUp,
  "chevron.down": ChevronDown,
  "bubble.left.and.bubble.right": MessageSquare,
  plus: Plus,
};

interface SymbolImageProps {
  className?: string;
  /** SF Symbol name (e.g. "arrow.up", "chevron.down") */
  name: string;
  sfEffect?: ImageProps["sfEffect"];
  size?: number;
  style?: ImageStyle;
  tintColor?: string;
  transition?: ImageProps["transition"];
}

export function SymbolImage({
  name,
  size = 24,
  tintColor,
  style,
  className,
  sfEffect,
  transition,
}: SymbolImageProps) {
  if (process.env.EXPO_OS === "ios") {
    return (
      <Image
        className={className}
        sfEffect={sfEffect}
        source={`sf:${name}`}
        style={[{ width: size, height: size }, style]}
        tintColor={tintColor}
        transition={transition}
      />
    );
  }

  const Icon = LUCIDE_FALLBACKS[name] ?? HelpCircle;
  return <Icon color={tintColor} size={size} style={style as any} />;
}
