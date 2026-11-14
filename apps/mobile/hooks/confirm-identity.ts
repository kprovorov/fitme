import { isClerkAPIResponseError, useClerk } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { PendingReverification } from "~/hooks/reverification";

/** How long a sent code holds back the next one, as the code screen does. */
const RESEND_DELAY_MS = 60_000;

/** The length of the code Clerk emails. */
export const CODE_LENGTH = 6;

/** Clerk's codes for a wrong password and a wrong (or expired) code. */
const WRONG_PASSWORD_CODES = new Set(["form_password_incorrect"]);

const WRONG_CODE_CODES = new Set([
  "form_code_incorrect",
  "verification_expired",
  "verification_failed",
]);

/** How the User confirms: their password, or a code emailed to them. */
export type ConfirmMethod = "code" | "password";

type Operation = "send" | "start" | "verify";

/** A `confirmIdentity.errors` key. */
export type ConfirmErrorKey =
  | "codeNotSent"
  | "failed"
  | "passwordIncorrect"
  | "wrongCode";

/** The emailed-code factor Clerk offers: the address it goes to. */
interface EmailFactor {
  readonly email: string;
  readonly emailAddressId: string;
}

/** What Clerk's session verification answers, as far as the sheet reads it. */
interface VerificationAnswer {
  readonly status: string;
  readonly supportedFirstFactors:
    | readonly {
        readonly emailAddressId?: string;
        readonly safeIdentifier?: string;
        readonly strategy: string;
      }[]
    | null;
}

const emailFactorOf = ({
  supportedFirstFactors,
}: VerificationAnswer): EmailFactor | null => {
  for (const factor of supportedFirstFactors ?? []) {
    const { emailAddressId, safeIdentifier, strategy } = factor;

    if (
      strategy === "email_code" &&
      emailAddressId !== undefined &&
      safeIdentifier !== undefined
    ) {
      return { email: safeIdentifier, emailAddressId };
    }
  }

  return null;
};

const offersPassword = ({ supportedFirstFactors }: VerificationAnswer) =>
  (supportedFirstFactors ?? []).some(({ strategy }) => strategy === "password");

/** The message for a failed attempt: a wrong password or code, or anything else. */
const attemptErrorKey = (
  method: ConfirmMethod,
  error: unknown
): ConfirmErrorKey => {
  const code = isClerkAPIResponseError(error)
    ? (error.errors[0]?.code ?? "")
    : "";

  if (method === "password" && WRONG_PASSWORD_CODES.has(code)) {
    return "passwordIncorrect";
  }

  if (method === "code" && WRONG_CODE_CODES.has(code)) {
    return "wrongCode";
  }

  return "failed";
};

/** Whole seconds left of `until`, ticking while there are any. */
const useCountdown = (until: number) => {
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  const running = remaining > 0;

  useEffect(() => {
    if (!running) {
      return;
    }

    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", update);

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [running]);

  return remaining;
};

/**
 * "Confirm it's you" over Clerk's session reverification: it starts the
 * verification for `reverification`'s level, then asks for the password
 * when the User has one and Clerk offers it, otherwise emails a code to the
 * primary address. `onDone("complete")` runs once Clerk says the session is
 * verified, never before; a wrong password or code keeps the sheet open
 * with its error.
 */
export const useConfirmIdentity = (
  reverification: PendingReverification,
  onDone: (answer: "cancel" | "complete") => void
) => {
  const clerk = useClerk();
  const [method, setMethod] = useState<ConfirmMethod | null>(null);
  const [emailFactor, setEmailFactor] = useState<EmailFactor | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [operation, setOperation] = useState<Operation | null>("start");
  const [errorKey, setErrorKey] = useState<ConfirmErrorKey | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const resendIn = useCountdown(resendAt);
  const mounted = useRef(true);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  /** Emails a code to `factor`, then shows the code variant. */
  const sendCode = useCallback(
    async (factor: EmailFactor) => {
      setOperation("send");
      setErrorKey(null);

      try {
        await clerk.session?.prepareFirstFactorVerification({
          emailAddressId: factor.emailAddressId,
          strategy: "email_code",
        });

        if (mounted.current) {
          setCode("");
          setResendAt(Date.now() + RESEND_DELAY_MS);
        }
      } catch {
        if (mounted.current) {
          setErrorKey("codeNotSent");
        }
      }

      if (mounted.current) {
        setMethod("code");
        setOperation(null);
      }
    },
    [clerk]
  );

  const start = useCallback(async () => {
    const { session } = clerk;

    if (!session) {
      setErrorKey("failed");
      setOperation(null);

      return;
    }

    try {
      const answer = await session.startVerification({
        level: reverification.level,
      });

      if (!mounted.current) {
        return;
      }

      const offered = emailFactorOf(answer);
      setEmailFactor(offered);

      if (answer.status === "needs_first_factor" && offersPassword(answer)) {
        setMethod("password");
        setOperation(null);
      } else if (answer.status === "needs_first_factor" && offered) {
        await sendCode(offered);
      } else {
        // A second factor, or nothing Fitme can ask for: it can't go on.
        setErrorKey("failed");
        setOperation(null);
      }
    } catch {
      if (mounted.current) {
        setErrorKey("failed");
        setOperation(null);
      }
    }
  }, [clerk, reverification.level, sendCode]);

  useEffect(() => {
    // One verification per ask, whatever re-renders the sheet.
    if (startedFor.current === reverification.id) {
      return;
    }

    startedFor.current = reverification.id;
    void start();
  }, [reverification.id, start]);

  const attempt = useCallback(
    async (confirmMethod: ConfirmMethod) => {
      const { session } = clerk;

      if (!session) {
        throw new Error("No session to verify.");
      }

      const answer = await session.attemptFirstFactorVerification(
        confirmMethod === "password"
          ? { password, strategy: "password" }
          : { code, strategy: "email_code" }
      );

      return answer.status === "complete";
    },
    [clerk, code, password]
  );

  const verify = useCallback(async () => {
    if (!method) {
      return;
    }

    setOperation("verify");
    setErrorKey(null);
    let next: ConfirmErrorKey | null = "failed";

    try {
      if (await attempt(method)) {
        next = null;
      }
    } catch (error) {
      next = attemptErrorKey(method, error);
    }

    if (!mounted.current) {
      return;
    }

    if (next === null) {
      onDone("complete");

      return;
    }

    setErrorKey(next);
    setOperation(null);
  }, [attempt, method, onDone]);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    setErrorKey(null);
  }, []);

  const handleCodeChange = useCallback((value: string) => {
    setCode(value);
    setErrorKey(null);
  }, []);

  /** "Forgot password?" and resend: emails a (new) code. */
  const handleEmailCode = useCallback(() => {
    if (emailFactor) {
      void sendCode(emailFactor);
    }
  }, [emailFactor, sendCode]);

  const value = method === "password" ? password : code;

  return {
    canContinue:
      method === "password"
        ? value.length > 0
        : method === "code" && value.length === CODE_LENGTH,
    handleCodeChange,
    handlePasswordChange,
    code,
    email: emailFactor?.email ?? null,
    handleEmailCode,
    errorKey,
    method,
    operation,
    password,
    resendIn,
    verify,
  };
};
