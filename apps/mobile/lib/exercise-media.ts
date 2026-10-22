import { PixelRatio } from "react-native";

/** Supabase's image transformation endpoint, which the Exercise Library's thumbnails use. */
const RENDER_ENDPOINT = "/storage/v1/render/image/";

/**
 * A thumbnail at the size it's shown, in device pixels: the render endpoint
 * takes `width` / `height`. Other URLs (the legacy table's) go as they are.
 */
export const sizedThumbnailUrl = (
  url: string,
  width: number,
  height = width
) => {
  if (!url.includes(RENDER_ENDPOINT)) {
    return url;
  }
  const pixels = PixelRatio.getPixelSizeForLayoutSize;
  return `${url}${url.includes("?") ? "&" : "?"}width=${pixels(width)}&height=${pixels(height)}`;
};
