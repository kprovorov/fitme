import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

type Appearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

/**
 * Clerk's look, fed from the `@fitme/design-tokens` CSS variables, so its
 * components (`<SignIn>`, `<UserButton>` and its menu, the account modal)
 * follow the tokens with no copy of their values. Clerk derives its shades
 * from these with `color-mix()` and relative colors, which accept `var()`.
 * Tailwind only emits a token some source names, and it finds these literal
 * `var(--…)` strings, so keep them literal.
 *
 * Mapped onto what Clerk draws: its "background" is its card, so `card`; its
 * "input" is a field's fill, so `muted`, which shows on the card. Clerk fades
 * its borders to a few percent of `colorBorder`, so the code boxes and the
 * menu get their fill and edge in `elements`. There's no warning token, so
 * Clerk's notices stay neutral. No shadows (ADR 0009). Passed once, to
 * `ClerkProvider`.
 */
export const clerkAppearance: Appearance = {
  elements: {
    // The device icons are Clerk's own SVGs: a laptop with hardcoded fills
    // (a black screen and a dark grey chassis, lost on `card`) and a phone
    // drawn through the `--cl-*` variables below. Both get a
    // `muted-foreground` chassis around a `muted` screen. The fill selectors
    // match Clerk's markup, not its typed API: recheck on a Clerk bump
    activeDeviceIcon: {
      "--cl-chassis-back": "var(--color-muted-foreground)",
      "--cl-chassis-bottom": "var(--color-muted-foreground)",
      "--cl-chassis-screen": "var(--color-muted-foreground)",
      "--cl-screen": "var(--color-muted)",
      '& path[fill="#000"]': { fill: "var(--color-muted)" },
      '& path[fill="#444"], & path[fill="#575757"]': {
        fill: "var(--color-muted-foreground)",
      },
    },
    // Clerk's neutral badge ("This device", "Primary") is its default
    // `data-color="primary"` one: text and fill as alphas of `colorBorder`,
    // which is already 10% white, so the text came out about 1.3:1 on
    // `card`. `muted-foreground` on `muted` is about 5.9:1. Coloured badges
    // (danger and the rest) keep Clerk's look
    badge: {
      '&[data-color="primary"]': {
        backgroundColor: "var(--color-muted)",
        borderColor: "var(--color-border)",
        color: "var(--color-muted-foreground)",
      },
    },
    // Each rule below matches Clerk's data attributes, which are its markup,
    // not its typed API: recheck on a Clerk bump
    button: {
      // Any active Clerk button (the account modal's selected page) keeps
      // its fill, not lime text
      '&[data-active="true"]': { color: "var(--color-foreground)" },
      // Lime is the accent, not the paint (FIT-247): it stays on solid
      // primary buttons and on `link` ones (inline text links, like "Forgot
      // password?"). Clerk's ghost buttons ("Update password", the delete
      // confirm's "Cancel") look like the web `ghost` Button instead:
      // `foreground` text, `muted` on hover and focus rather than a lime tint
      '&[data-variant="ghost"][data-color="primary"]': {
        color: "var(--color-foreground)",
      },
      '&[data-variant="ghost"][data-color="primary"]:hover, &[data-variant="ghost"][data-color="primary"]:focus-visible':
        {
          backgroundColor: "var(--color-muted)",
          color: "var(--color-foreground)",
        },
      // Clerk's solid danger buttons (the account deletion confirm, for one)
      // draw white text on `destructive`, about 2.8:1, and Clerk has no
      // danger-foreground variable. They get the destructive Button's look
      // instead (FIT-248): `secondary` fill, `destructive` text. Clerk's
      // `box-shadow` (a `colorDanger` ring, drop shadows, its focus ring)
      // goes, and focus gets the web Button's ring
      '&[data-variant="solid"][data-color="danger"]': {
        backgroundColor: "var(--color-secondary)",
        boxShadow: "none",
        color: "var(--color-destructive)",
      },
      '&[data-variant="solid"][data-color="danger"]:focus-visible': {
        boxShadow: "0 0 0 2px var(--color-card), 0 0 0 4px var(--color-ring)",
      },
    },
    // The code boxes ignore `colorInput`, so they get its fill here
    otpCodeFieldInput: { backgroundColor: "var(--color-muted)" },
    // Clerk gives each section title a fixed width (264 px), wider than the
    // account modal's content at 320 px, so the page scrolled sideways
    profileSectionHeader: { maxWidth: "100%" },
    // The menu is `card` over cards, so it needs a visible edge
    userButtonPopoverCard: { border: "1px solid var(--color-border)" },
  },
  variables: {
    borderRadius: "var(--radius-lg)",
    colorBackground: "var(--color-card)",
    colorBorder: "var(--color-border)",
    colorDanger: "var(--color-destructive)",
    colorForeground: "var(--color-foreground)",
    colorInput: "var(--color-muted)",
    colorInputForeground: "var(--color-foreground)",
    colorModalBackdrop:
      "color-mix(in srgb, var(--color-background) 75%, transparent)",
    colorMuted: "var(--color-muted)",
    colorMutedForeground: "var(--color-muted-foreground)",
    colorNeutral: "var(--color-foreground)",
    colorPrimary: "var(--color-primary)",
    colorPrimaryForeground: "var(--color-primary-foreground)",
    colorRing: "var(--color-ring)",
    colorShadow: "transparent",
    colorWarning: "var(--color-muted-foreground)",
    fontFamily: "var(--font-nunito-sans-regular)",
    fontFamilyButtons: "var(--font-nunito-sans-semibold)",
    fontFamilyMono: "var(--font-ibm-plex-mono)",
  },
};
