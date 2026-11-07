import { PixelRatio } from "react-native";

/** Supabase's image transformation endpoint, which the Library's thumbnails use. */
const RENDER_ENDPOINT = "/storage/v1/render/image/";

const pixels = (value: number) => PixelRatio.getPixelSizeForLayoutSize(value);

/**
 * A thumbnail at the size it's shown, in device pixels: the render endpoint
 * takes `width` / `height`. Other URLs go as they are.
 */
export const sizedThumbnailUrl = (
  url: string,
  width: number,
  height = width
) => {
  if (!url.includes(RENDER_ENDPOINT)) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}width=${pixels(width)}&height=${pixels(height)}`;
};
