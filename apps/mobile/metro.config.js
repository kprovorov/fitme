/// <reference types="node" />

import { getSentryExpoConfig } from "@sentry/react-native/metro.js";
import { withUniwindConfig } from "uniwind/metro";

const config = getSentryExpoConfig(import.meta.dirname);

export default withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  polyfills: { rem: 16 },
});
