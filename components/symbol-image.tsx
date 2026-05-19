import {
  Image as ExpoImage,
  type ImageProps,
  type ImageStyle,
} from "expo-image";
import {
  Activity,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Heart,
  HelpCircle,
  Home,
  type LucideIcon,
  MessageSquare,
  Plus,
  Zap,
} from "lucide-react-native";

import { withUniwind } from "uniwind";

const Image = withUniwind(ExpoImage);

/**
 * Map of SF Symbol names to Lucide icons for Android/web fallback.
 */
const LUCIDE_FALLBACKS: Record<string, LucideIcon> = {
  "arrow.up": ArrowUp,
  "bolt.fill": Zap,
  "bubble.left.and.bubble.right": MessageSquare,
  "building.2": Building2,
  "chevron.down": ChevronDown,
  "chevron.right": ChevronRight,
  dumbbell: Dumbbell,
  "figure.run": Activity,
  "figure.strengthtraining.traditional": Dumbbell,
  "figure.walk": Activity,
  heart: Heart,
  house: Home,
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
  // biome-ignore lint/suspicious/noExplicitAny: Lucide icon style prop type is wider than what RN provides
  return <Icon color={tintColor} size={size} style={style as any} />;
}
