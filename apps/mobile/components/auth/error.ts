import { isClerkAPIResponseError } from "@clerk/expo";
import { z } from "zod";

import { getClerkErrorMessage } from "~/lib/clerk";
import { i18n } from "~/lib/i18n";

const NETWORK_FAILURE = /network|fetch|connection|offline/iu;

const authErrorSchema = z.unknown().transform((input) => {
  if (isClerkAPIResponseError(input) || input instanceof TypeError) {
    return input;
  }

  return null;
});

type AuthError = z.infer<typeof authErrorSchema>;

const formatAuthErrorMessage = (error: AuthError): string => {
  if (error === null) {
    return i18n.t("common.genericError");
  }

  if (
    isClerkAPIResponseError(error) &&
    error.errors.some(
      (item) =>
        item.code === "form_password_incorrect" ||
        item.code === "form_identifier_not_found"
    )
  ) {
    return i18n.t("auth.errors.credentials");
  }

  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) {
    return i18n.t("auth.errors.connection");
  }

  return getClerkErrorMessage(error);
};

const authMessageSchema = authErrorSchema.transform(formatAuthErrorMessage);

export const getAuthErrorMessage = (error: unknown) =>
  authMessageSchema.parse(error);
