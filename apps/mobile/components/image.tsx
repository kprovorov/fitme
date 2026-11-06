import { Image as ExpoImage } from "expo-image";
import type { ComponentProps } from "react";
import { withUniwind } from "uniwind";

const StyledImage = withUniwind(ExpoImage);

export const Image = (props: ComponentProps<typeof StyledImage>) => (
  <StyledImage {...props} />
);
