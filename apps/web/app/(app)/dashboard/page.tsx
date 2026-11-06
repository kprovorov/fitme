import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { DashboardView } from "~/components/dashboard/dashboard-view";
import { isUnexpectedFailure, loadDashboard } from "~/lib/dashboard";

const DashboardPage = async () => {
  // Resolve auth here, not inside `loadDashboard`'s token getter: the Public
  // API client turns anything thrown there into an `ApiError`, which would
  // swallow Next's dynamic-rendering bailout.
  const { getToken } = await auth();
  const result = await loadDashboard({ getToken });

  if (result.ok) {
    return <DashboardView data={result.data} />;
  }

  // The error state replaces the throw the page used to do, so `onRequestError`
  // never sees these: report the ones nothing else would (an unset
  // PUBLIC_API_URL, a network failure, a refused or broken answer).
  if (isUnexpectedFailure(result.error)) {
    Sentry.captureException(result.error);
  }

  return <DashboardView error={result.error} />;
};

export default DashboardPage;
