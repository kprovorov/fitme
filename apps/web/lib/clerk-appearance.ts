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
 * Mapped onto what Clerk draws: its "background" is its card, so `card`; its
 * "input" is a field's fill, so `muted`, which shows on the card (Clerk fades
 * its own borders too far for them to outline a field); its borders get
 * `input`. There's no warning token, so Clerk's notices stay neutral. No
 * shadows (ADR 0009). Passed once, to `ClerkProvider`.
 */
export const clerkAppearance: Appearance = {
  // The code boxes ignore `colorInput`, so they get its fill here
  elements: { otpCodeFieldInput: { backgroundColor: "var(--color-muted)" } },
  variables: {
    borderRadius: "var(--radius-lg)",
    colorBackground: "var(--color-card)",
    colorBorder: "var(--color-input)",
    colorDanger: "var(--color-destructive)",
    colorForeground: "var(--color-foreground)",
    colorInput: "var(--color-muted)",
    colorInputForeground: "var(--color-foreground)",
    colorModalBackdrop: "var(--color-background)",
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
