export const codePurposes = ["sign-up", "reset-password", "sign-in"] as const;
export type CodePurpose = (typeof codePurposes)[number];
export type VerificationSource = "login" | "reset-password" | "social";
export type VerificationIntent =
  | { purpose: "sign-up" | "reset-password" }
  | { purpose: "sign-in"; source: VerificationSource };
export const isCodePurpose = (value: unknown): value is CodePurpose =>
  codePurposes.some((purpose) => purpose === value);
export function parseVerificationIntent(params: {
  purpose?: unknown;
  source?: unknown;
}): VerificationIntent | undefined {
  if (!isCodePurpose(params.purpose)) {
    return;
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
}

export function supportsEmailChallenge(
  status: string | null,
  factors: readonly { strategy: string }[]
) {
  return (
    (status === "needs_client_trust" || status === "needs_second_factor") &&
    factors.some((factor) => factor.strategy === "email_code")
  );
}
