import { z } from "zod";

export const codePurposes = [
  "sign-up",
  "reset-password",
  "sign-in",
  "change-email",
] as const;

export type CodePurpose = (typeof codePurposes)[number];

export type VerificationSource = "login" | "reset-password" | "social";

export type VerificationIntent =
  | { purpose: "sign-up" | "reset-password" }
  | { purpose: "sign-in"; source: VerificationSource }
  | { emailAddressId: string; purpose: "change-email" };

const emailAddressIdSchema = z.string().min(1);

export const isCodePurpose = (value: unknown): value is CodePurpose =>
  codePurposes.some((purpose) => purpose === value);

export const parseVerificationIntent = (params: {
  emailAddressId?: unknown;
  purpose?: unknown;
  source?: unknown;
}): VerificationIntent | undefined => {
  if (!isCodePurpose(params.purpose)) {
    return;
  }

  if (params.purpose === "change-email") {
    // The address being added, which the code was sent to.
    const emailAddressId = emailAddressIdSchema.safeParse(
      params.emailAddressId
    );

    return emailAddressId.success
      ? { emailAddressId: emailAddressId.data, purpose: "change-email" }
      : undefined;
  }

  if (params.purpose !== "sign-in") {
    return { purpose: params.purpose };
  }

  const source = params.source ?? "reset-password";

  if (
    source !== "login" &&
    source !== "reset-password" &&
    source !== "social"
  ) {
    return;
  }

  return { purpose: "sign-in", source };
};

export const supportsEmailChallenge = (
  status: string | null,
  factors: readonly { strategy: string }[]
) =>
  (status === "needs_client_trust" || status === "needs_second_factor") &&
  factors.some((factor) => factor.strategy === "email_code");
