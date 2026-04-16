import { useEffect, useState } from "react";
import { usePlansQuery } from "~/hooks/queries/plans";
import type { Plan } from "~/lib/models";
import PlanCard from "../plans/plan-card";

export default function ActivePlanView() {
  const { data: plans } = usePlansQuery();
  const [activePlan, setActivePlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  return activePlan ? <PlanCard plan={activePlan} /> : null;
}
