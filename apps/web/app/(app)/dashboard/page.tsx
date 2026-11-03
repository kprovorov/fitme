import { auth } from "@clerk/nextjs/server";
import { DashboardView } from "~/components/dashboard/dashboard-view";
import { loadDashboard } from "~/lib/dashboard";

export default async function DashboardPage() {
  // Resolve auth here, not inside `loadDashboard`'s token getter: the Public
  // API client turns anything thrown there into an `ApiError`, which would
  // swallow Next's dynamic-rendering bailout.
  const { getToken } = await auth();
  const result = await loadDashboard({ getToken });

  return result.ok ? (
    <DashboardView data={result.data} />
  ) : (
    <DashboardView error={result.error} />
  );
}
