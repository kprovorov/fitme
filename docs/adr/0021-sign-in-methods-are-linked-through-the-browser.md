---
status: accepted
date: 2026-11-14
---

# Sign-in methods are linked through the browser, and offered by platform, not by flag

Account & Security lets a signed-in User connect Apple or Google to their User and disconnect one. Signing in with Apple or Google uses each platform's native sheet (`hooks/native-social-auth.ts`), so the obvious design was to connect the same way. Clerk doesn't allow it: `user.createExternalAccount` takes a `strategy` and a `redirectUrl`, never the ID token a native sheet returns, so a native token can start a sign-in but can't be added to a User who is already signed in. Connect therefore runs Clerk's browser OAuth flow for that provider in the in-app browser sheet and comes back to the app. Clerk's own automatic linking (signing in with a provider whose verified email matches the User's) still happens on sign-in, but isn't Connect.

Google works with the existing Clerk setup. Apple's browser flow needs an Apple Services ID and key configured in Clerk, a one-off human task, until which Connect Apple fails on tap with an error.

Which providers the app offers no longer comes from `EXPO_PUBLIC_AUTH_APPLE_ENABLED` / `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED`, which are dropped. The rule, for sign-in, registration and Account & Security alike:

- **Apple**: always on iOS; never on Android, which has no native Apple sheet.
- **Google**: always, as long as the build carries its client ids (`EXPO_PUBLIC_CLERK_GOOGLE_*`); a build without them hides Google and logs a warning, so no button that can't work reaches anyone.

The app doesn't ask Clerk which providers the instance enables: that is only readable through Clerk's internal `__internal_environment`.

Disconnect is offered only while the User keeps another way to sign in (a password or another provider), and every Connect and Disconnect goes through Clerk's reverification ("Confirm it's you").

## Considered options

- **Connect through the browser (chosen).** Matches the design, works for both providers, costs a browser hop.
- **No Connect, status and Disconnect only.** No browser flow, but a User could only link a provider by signing in with it under the same email.
- **Connect natively.** Impossible through Clerk's public SDK.

## Consequences

- Connect and sign-in look different for the same provider: a native sheet to sign in, a browser sheet to connect.
- Connect Apple is broken until the Apple Services ID is set up in Clerk; that stays a ready-for-human task.
