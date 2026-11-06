import { View } from "react-native";

export const BlurViewRawBackdrop = ({
  tint: _tint = "default",
  intensity: _intensity = 50,
  ...props
}) => <View className="absolute inset-0" {...props} />;
