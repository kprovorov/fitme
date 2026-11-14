export interface GoogleClientIds {
  iosClientId: string;
  iosUrlScheme: string;
  webClientId: string;
}

// The build's public Google client ids, the only configuration the sign-in
// providers depend on (ADR 0021). Apple needs none: it follows the platform.
export const googleClientIds = (): GoogleClientIds => ({
  iosClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID ?? "",
  iosUrlScheme: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME ?? "",
  webClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ?? "",
});
