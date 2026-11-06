import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";

const X = ({ ...props }: SvgProps) => (
  <Svg height="48" viewBox="0 0 48 48" width="48" {...props}>
    <Path d="M37.34 3H44.39L28.91 20.63L47 44.54H32.81L21.69 30.01L8.97 44.54H1.92L18.32 25.69L1 3H15.55L25.59 16.27L37.34 3ZM34.88 40.4H38.78L13.49 6.99H9.29L34.88 40.4Z" />
  </Svg>
);

export default X;
