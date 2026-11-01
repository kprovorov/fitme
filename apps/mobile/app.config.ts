import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  extra: {
    ...config.extra,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
  },
  name: config.name ?? "Fitme Project",
  slug: config.slug ?? "fitme-project",
});
