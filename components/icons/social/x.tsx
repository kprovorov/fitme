import React from "react";
import Svg, { Path, SvgProps } from "react-native-svg";

export default function X({ ...props }: SvgProps) {
  return (
    <Svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      className="color-primary"
      {...props}
    >
      <Path d="M37.3432 3.00024H44.3942L28.9127 20.6277L47 44.5397H32.8061L21.6931 30.0086L8.97068 44.5397H1.91969L18.3209 25.686L1 3.00024H15.5465L25.5865 16.2745L37.3432 3.00024ZM34.8754 40.4011H38.7841L13.4925 6.98558H9.29257L34.8754 40.4011Z" />
    </Svg>
  );
}
