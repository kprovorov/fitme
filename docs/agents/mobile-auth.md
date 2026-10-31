# Enable native sign-in on mobile

Fitme uses custom auth screens and Clerk's native Apple and Google hooks. The native packages and build plugins are included in the mobile app. Configure the provider for the Clerk instance used by the build before enabling its button.

## Register the native app

1. Open the selected instance's [Native applications](https://dashboard.clerk.com/~/native-applications) settings.
2. Confirm that the Native API is enabled.
3. Register the iOS bundle `com.fitmeproject.ios` with its exact App ID Prefix from Apple Developer. The prefix can differ from the Team ID.
4. For Android Google sign-in, register the Android package `com.fitmeproject.ios` with its signing certificate fingerprint.

Use separate development and production instance registrations. The existing Apple association file identifies the iOS app as `X75M2KSBQL.com.fitmeproject.ios`. Confirm the prefix against the Apple identifier before creating a registration.

## Configure Apple

1. Enable Sign in with Apple for the app identifier in Apple Developer.
2. Enable Apple for sign-up and sign-in in the matching Clerk instance.
3. Configure Apple Private Relay email sources if Users can hide their email.

The app uses the native iOS flow. Apple is omitted on other platforms. Native Apple setup does not require a web Services ID or web client secret. A separate browser-based Apple flow would require those credentials.

Follow [Clerk's native Apple setup](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-apple) for the provider settings.

## Configure Google

1. Create Google OAuth clients for the web and each native platform in the same Google Cloud project.
2. Use the iOS bundle id for the iOS client. Configure Android package and signing fingerprints for an Android client.
3. Add the Clerk redirect URI to the web client's authorized redirect URIs.
4. Enable Google with custom credentials in the matching Clerk instance.
5. Put the web client id and client secret in Clerk's provider settings.

The web client is required for native token verification. Keep the client secret in Clerk. Never expose it through an `EXPO_PUBLIC_` variable.

Follow [Clerk's native Google setup](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google) for Google Cloud and Clerk configuration.

## Set public build configuration

Manage local values through Infisical `dev` `/Mobile` and regenerate the env file with `scripts/pull-env.sh`, as described in [Secrets](secrets.md). Configure the corresponding public values in each EAS build environment too.

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_AUTH_APPLE_ENABLED` | `true` after Apple and the native app registration are configured |
| `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED` | `true` after Google and the native app registrations are configured |
| `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` | Web OAuth client id |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID` | iOS OAuth client id |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` | `com.googleusercontent.apps.` followed by the iOS client id without `.apps.googleusercontent.com` |

The readiness flags default to false. Builds without a configured provider use the email fallback from Figma. A flag applies to that build, so enable Google only for platforms whose provider registration is complete.

`app.config.ts` exposes Google's public values through Expo's `extra` field. This is required because Expo does not inline app env variables into Clerk's code in `node_modules`. The Google plugin adds the configured callback scheme to the iOS app.

## Rebuild and verify

1. Run `pnpm ios` for an iOS development build. Native dependency and callback changes need a rebuild.
2. Test Apple and Google from Welcome, login, and sign-up.
3. Cancel each provider sheet and confirm that the form remains usable without an error.
4. Test a returning User and confirm that their existing Profile and Plans remain under the same Clerk id.
5. Test a social User with no name. Authentication must continue without a name-completion step.
6. Relaunch the app and confirm that the session remains active.
7. Test provider failure and retry, and complete any supported email verification challenge.

Verify Apple on a physical iPhone before release. Check the auth screens with the keyboard open and at the largest text size on the smallest and largest supported iPhones.

Email registration still asks for a name. New and reset passwords require eight characters. Login accepts existing nonempty passwords and lets Clerk validate them. Fitness onboarding remains separate and skippable.


## Deferred provider setup

The native integration can ship with email auth while provider readiness flags are false. The remaining account setup and release verification are tracked in [Google setup (FIT-488)](https://linear.app/provorov/issue/FIT-488/configure-google-cloud-oauth-and-enable-native-google-sign-in) and [Apple setup (FIT-489)](https://linear.app/provorov/issue/FIT-489/finish-apple-native-sign-in-setup-and-verify-on-a-real-iphone).
