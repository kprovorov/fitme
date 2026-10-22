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
    // Clerk has no danger-foreground variable, so its solid danger buttons
    // (the account deletion confirm, for one) draw white text on
    // `destructive`, about 2.8:1; every one carries these data attributes.
    // They're Clerk's markup, not its typed API: recheck on a Clerk bump
    button: {
      '&[data-variant="solid"][data-color="danger"]': {
        color: "var(--color-destructive-foreground)",
      },
    },
    // The code boxes ignore `colorInput`, so they get its fill here
    otpCodeFieldInput: { backgroundColor: "var(--color-muted)" },
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
