import {
  type ExperienceLevel,
  type Goal,
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
  type Place,
} from "@fitme/core";
import type { Tables } from "@fitme/supabase";
import { formatDistanceToNow } from "date-fns";
import { LocalDate } from "~/components/local-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { createClient } from "~/lib/supabase/server";

type PlanRow = Tables<"plans">;

const RECENT_SESSIONS_LIMIT = 10;
const SESSION_SELECT =
  "id, started_at, finished_at, workout:workouts (name), plan:plans (name)";

function PlanCard({ plan }: { plan: PlanRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-title-3-emphasized">
            {plan.name ?? "Untitled plan"}
          </CardTitle>
          {plan.is_active ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-caption-1-emphasized text-primary-foreground">
              Active
            </span>
          ) : null}
        </div>
        {plan.description ? (
          <CardDescription className="text-subhead">
            {plan.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-subhead sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Goal</dt>
            <dd className="text-subhead-emphasized">
              {getGoalLabel(plan.goal as Goal)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Place</dt>
            <dd className="text-subhead-emphasized">
              {getPlaceLabel(plan.place as Place)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Level</dt>
            <dd className="text-subhead-emphasized">
              {getExperienceLevelLabel(
                plan.experience_level as ExperienceLevel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd className="text-subhead-emphasized">
              {plan.frequency}x / week · {plan.workout_duration} min
            </dd>
          </div>
        </dl>
        {plan.created_at ? (
          <p className="mt-4 text-caption-1 text-muted-foreground">
            Created{" "}
            {formatDistanceToNow(new Date(plan.created_at), {
              addSuffix: true,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface SessionItem {
  finished_at: string | null;
  id: string;
  plan: { name: string | null } | null;
  started_at: string;
  workout: { name: string } | null;
}

function SessionRow({ session }: { session: SessionItem }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col">
        <span className="text-body-emphasized">
          {session.workout?.name ?? "Deleted workout"}
        </span>
        {session.plan?.name ? (
          <span className="text-caption-1 text-muted-foreground">
            {session.plan.name}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col items-end text-subhead">
        <LocalDate value={session.started_at} />
        <span className="text-caption-1 text-muted-foreground">
          {session.finished_at ? "Finished" : "In progress"}
        </span>
      </div>
    </li>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [plansResult, sessionsResult] = await Promise.all([
    supabase
      .from("plans")
      .select("*")
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .order("started_at", { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT),
  ]);

  if (plansResult.error) {
    throw new Error(`Failed to load plans: ${plansResult.error.message}`);
  }
  if (sessionsResult.error) {
    throw new Error(
      `Failed to load workout sessions: ${sessionsResult.error.message}`
    );
  }
  const plans = plansResult.data;
  const sessions = sessionsResult.data;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-primary text-title-1-emphasized">Your plans</h1>
        <p className="text-muted-foreground text-subhead">
          Plans are generated and edited in the Fitme mobile app.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-title-3-emphasized">
              No plans yet
            </CardTitle>
            <CardDescription className="text-subhead">
              Open the Fitme app and let the AI planner build your first
              program.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-primary text-title-2-emphasized">
          Recent workouts
        </h2>
        <Card>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-subhead">
                Workouts you log in the Fitme app show up here.
              </p>
            ) : (
              <ul className="divide-y">
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
