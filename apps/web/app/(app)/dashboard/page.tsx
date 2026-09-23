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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { createClient } from "~/lib/supabase/server";

type PlanRow = Tables<"plans">;

function PlanCard({ plan }: { plan: PlanRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{plan.name ?? "Untitled plan"}</CardTitle>
          {plan.is_active ? (
            <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs">
              Active
            </span>
          ) : null}
        </div>
        {plan.description ? (
          <CardDescription>{plan.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Goal</dt>
            <dd className="font-semibold">{getGoalLabel(plan.goal as Goal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Place</dt>
            <dd className="font-semibold">
              {getPlaceLabel(plan.place as Place)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Level</dt>
            <dd className="font-semibold">
              {getExperienceLevelLabel(
                plan.experience_level as ExperienceLevel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd className="font-semibold">
              {plan.frequency}x / week · {plan.workout_duration} min
            </dd>
          </div>
        </dl>
        {plan.created_at ? (
          <p className="mt-4 text-muted-foreground text-xs">
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("*")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load plans: ${error.message}`);
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl">Your plans</h1>
        <p className="text-muted-foreground text-sm">
          Plans are generated and edited in the Fitme mobile app.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No plans yet</CardTitle>
            <CardDescription>
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
    </>
  );
}
