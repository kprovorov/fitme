import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

type Appearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

/**
 * Clerk's look, fed from the `@fitme/design-tokens` CSS variables, so its
 * components (`<SignIn>`, `<UserButton>` and its menu) follow the tokens with
 * no copy of their values. Clerk derives its shades from these with
 * `color-mix()` and relative colors, which accept `var()`. Its "background" is
 * the card it draws, so it gets `card` like every other card; its "input" is
 * the field's fill, so it gets `background` like the `Input` Primitive. No
 * shadows (ADR 0009). Passed once, to `ClerkProvider`.
 */
export const clerkAppearance: Appearance = {
  variables: {
    borderRadius: "var(--radius-lg)",
    colorBackground: "var(--color-card)",
    colorBorder: "var(--color-border)",
    colorDanger: "var(--color-destructive)",
    colorForeground: "var(--color-foreground)",
    colorInput: "var(--color-background)",
    colorInputForeground: "var(--color-foreground)",
    colorModalBackdrop: "var(--color-background)",
    colorMuted: "var(--color-muted)",
    colorMutedForeground: "var(--color-muted-foreground)",
    colorNeutral: "var(--color-foreground)",
    colorPrimary: "var(--color-primary)",
    colorPrimaryForeground: "var(--color-primary-foreground)",
    colorRing: "var(--color-ring)",
    colorShadow: "transparent",
    fontFamily: "var(--font-nunito-sans-regular)",
    fontFamilyButtons: "var(--font-nunito-sans-semibold)",
    fontFamilyMono: "var(--font-ibm-plex-mono)",
  },
};
