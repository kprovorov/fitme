import { Link } from "expo-router";
import { usePlansQuery } from "~/hooks/queries/plans";
import { useIsProQuery } from "~/hooks/revenueCat";
import PlanCard from "../plans/plan-card";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";

export default function PlansListView() {
  const { data: plans } = usePlansQuery();
  const { data: _isPro } = useIsProQuery();

  return (
    <VStack className="items-stretch">
      {plans?.map((plan) => (
        <Link href={`/plans/${plan.id}`} key={plan.id}>
          <PlanCard plan={plan} />
        </Link>
      ))}
      <Link asChild href="/planner">
        <Button>
          <Text>Create New Workout Plan</Text>
        </Button>
      </Link>
    </VStack>
  );
}
