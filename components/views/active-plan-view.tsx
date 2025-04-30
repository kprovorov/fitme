import React, { useEffect, useState } from "react";
import { Plan } from "~/lib/models";
import { usePlansQuery } from "~/hooks/queries/plans";
import { H4 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import PlanCard from "../plans/plan-card";
import { HStack } from "../ui/hstack";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Link } from "expo-router";

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
        <H4>My Plan</H4>
        <Link href="/plans" asChild>
          <Button variant="secondary" size="sm" shape="pill">
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
