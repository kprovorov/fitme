/**
 * Whether Arnold's Attachments are offered: the "+" in the composer and the
 * sheet behind it. Off while the feature is built (ADR 0018, project
 * "Attachments for Arnold"), so Users see the screen as it is today.
 *
 * It lives in its own module, and is inferred as `boolean` rather than
 * `false`, so the tickets building the feature can turn it on in a test
 * (`jest.mock` with a getter, as `components/ui/__tests__/button.test.tsx`
 * does for the glass flags). The last of them removes it.
 */
export const ATTACHMENTS_ENABLED = Boolean(false);
