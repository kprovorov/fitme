import { useWindowDimensions } from "react-native";

/** Past this text scale side-by-side content can no longer hold its words. */
const STACKED_FONT_SCALE = 1.4;

/**
 * Whether the text is large enough (an accessibility size) that content laid
 * out side by side should stack instead.
 */
export function useStackedLayout(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale > STACKED_FONT_SCALE;
}
