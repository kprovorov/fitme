const { withNativeWind } = require("nativewind/metro");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// biome-ignore lint/correctness/noGlobalDirnameFilename: Having ReferenceError othervise
const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: 16,
});
