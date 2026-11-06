import { rateLimitedFor } from "@fitme/api-client";
import type { ApiError } from "@fitme/api-client";
import {
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
} from "@fitme/core";
import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { formatDistanceToNow } from "date-fns";

import { LocalDate } from "~/components/local-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type {
  DashboardData,
  DashboardPlan,
  DashboardSession,
} from "~/lib/dashboard";

const PlanCard = ({ plan }: { plan: DashboardPlan }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <CardTitle>{plan.name ?? "Untitled plan"}</CardTitle>
        {plan.is_active ? (
          <span className="bg-primary text-caption-1-emphasized text-primary-foreground rounded-full px-2 py-0.5">
            Active
          </span>
        ) : null}
      </div>
      {plan.description ? (
        <CardDescription>{plan.description}</CardDescription>
      ) : null}
    </CardHeader>
    <CardContent>
      <dl className="text-subhead grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Goal</dt>
          <dd className="text-subhead-emphasized">
            {getGoalLabel(
              // SAFETY: This helper returns undefined for strings outside Goal.
              plan.goal as Goal
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Place</dt>
          <dd className="text-subhead-emphasized">
            {getPlaceLabel(
              // SAFETY: This helper returns undefined for strings outside Place.
              plan.place as Place
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Level</dt>
          <dd className="text-subhead-emphasized">
            {getExperienceLevelLabel(
              // SAFETY: This helper returns undefined for strings outside ExperienceLevel.
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
        <p className="text-caption-1 text-muted-foreground mt-4">
          Created{" "}
          {formatDistanceToNow(new Date(plan.created_at), {
            addSuffix: true,
          })}
        </p>
      ) : null}
    </CardContent>
  </Card>
);

const SessionRow = ({ session }: { session: DashboardSession }) => (
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
    <div className="text-subhead flex flex-col items-end">
      <LocalDate value={session.started_at} />
      <span className="text-caption-1 text-muted-foreground">
        {session.finished_at ? "Finished" : "In progress"}
      </span>
    </div>
  </li>
);

/**
 * Why the dashboard has nothing to show: the API's 429 says how long to wait,
 * everything else (a failed read, an unset `PUBLIC_API_URL`) reads the same.
 */
const errorMessage = (error: ApiError): string => {
  const retryAfterSeconds = rateLimitedFor(error);

  if (retryAfterSeconds === null) {
    return "Something went wrong while loading your plans and workouts. Reload the page to try again.";
  }

  return `You've made too many requests. Try again in ${retryAfterSeconds} seconds.`;
};

const DashboardError = ({ error }: { error: ApiError }) => (
  <Card>
    <CardHeader>
      <CardTitle>Couldn&apos;t load your training</CardTitle>
      <CardDescription>{errorMessage(error)}</CardDescription>
    </CardHeader>
  </Card>
);

export interface DashboardViewProps {
  /** What `/v1` answered, or nothing when the read failed. */
  data?: DashboardData;
  /** Why the read failed; `data` and `error` are never both set. */
  error?: ApiError;
}

/**
 * The dashboard: the User's Plans and their latest Workout Sessions as `/v1`
 * answered them, or the error state when the read failed.
 */
export const DashboardView = ({ data, error }: DashboardViewProps) => (
  <>
    <div className="flex flex-col gap-1">
      <h1 className="text-primary text-title-1-emphasized">Your plans</h1>
      <p className="text-muted-foreground text-subhead">
        Plans are generated and edited in the Fitme mobile app.
      </p>
    </div>

    {error ? <DashboardError error={error} /> : null}

    {data && data.plans.length === 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>No plans yet</CardTitle>
          <CardDescription>
            Open the Fitme app and let the AI planner build your first program.
          </CardDescription>
        </CardHeader>
      </Card>
    ) : null}

    {data && data.plans.length > 0 ? (
      <div className="grid gap-4">
        {data.plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    ) : null}

    {data ? (
      <section className="flex flex-col gap-4">
        <h2 className="text-primary text-title-2-emphasized">
          Recent workouts
        </h2>
        <Card>
          <CardContent>
            {data.sessions.length === 0 ? (
              <p className="text-muted-foreground text-subhead">
                Workouts you log in the Fitme app show up here.
              </p>
            ) : (
              <ul className="divide-y">
                {data.sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    ) : null}
  </>
);
