export interface NativeAuthConfig {
  appleEnabled: boolean;
  googleEnabled: boolean;
  googleIosClientId: string;
  googleIosUrlScheme: string;
  googleWebClientId: string;
}
export function nativeAuthConfig(): NativeAuthConfig {
  return {
    appleEnabled: process.env.EXPO_PUBLIC_AUTH_APPLE_ENABLED === "true",
    googleEnabled: process.env.EXPO_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
    googleIosClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID ?? "",
    googleIosUrlScheme:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME ?? "",
    googleWebClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ?? "",
  };
}
