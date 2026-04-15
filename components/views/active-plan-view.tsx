import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { usePlansQuery } from "~/hooks/queries/plans";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import type { Plan } from "~/lib/models";
import PlanCard from "../plans/plan-card";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { H3 } from "../ui/typography";
import { VStack } from "../ui/vstack";

export default function ActivePlanView() {
  const { data: plans } = usePlansQuery();
  const [activePlan, setActivePlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  return activePlan ? (
    <VStack className="flex-1 items-stretch">
      <HStack className="justify-between">
        <H3>My Plan</H3>
        <Link asChild href="/plans">
          <Button shape="pill" size="sm" variant="secondary">
            <HStack className="gap-xs">
              <Text>Manage Plans</Text>
              <Text asChild>
                <ArrowRight size={16} />
              </Text>
            </HStack>
          </Button>
        </Link>
      </HStack>
      <PlanCard plan={activePlan} />
    </VStack>
  ) : null;
}
