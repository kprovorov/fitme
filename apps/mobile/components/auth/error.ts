import { isClerkAPIResponseError } from "@clerk/expo";
import { getClerkErrorMessage } from "~/lib/clerk";
import { i18n } from "~/lib/i18n";

const NETWORK_FAILURE = /network|fetch|connection|offline/i;
export function getAuthErrorMessage(error: unknown): string {
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
}
