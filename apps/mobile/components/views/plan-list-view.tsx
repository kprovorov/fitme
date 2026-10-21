import { Link } from "expo-router";
import { Pressable } from "react-native";
import { usePlansQuery } from "~/hooks/queries/plans";
import { useIsProQuery } from "~/hooks/revenueCat";
import PlanCard from "../plans/plan-card";
import { Button } from "../ui/button";
import { VStack } from "../ui/vstack";

export default function PlansListView() {
  const { data: plans } = usePlansQuery();
  const { data: _isPro } = useIsProQuery();

  return (
    <VStack className="items-stretch">
      {plans?.map((plan) => (
        // `asChild` keeps the card out of the Text wrapper Link renders by
        // default, which clips the top edge of an inlined View.
        <Link asChild href={`/plans/${plan.id}`} key={plan.id}>
          <Pressable className="active:opacity-80">
            <PlanCard plan={plan} />
          </Pressable>
        </Link>
      ))}
      <Link asChild href="/planner">
        <Button label="Create New Workout Plan" />
      </Link>
    </VStack>
  );
}
