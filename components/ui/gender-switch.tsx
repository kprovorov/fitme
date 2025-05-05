import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import * as React from "react";
import { RadioGroupItemWithLabel } from "~/components/ui/radio-group";
import { RadioGroup } from "~/components/ui/radio-group";
import { getGenderLabel } from "~/lib/labels";
import { genders } from "~/lib/models";
import { cn } from "~/lib/utils";

const GenderSwitch = React.forwardRef<
  RadioGroupPrimitive.RootRef,
  RadioGroupPrimitive.RootProps
>(({ className, ...props }, ref) => {
  return (
    <RadioGroup
      className={cn(
        "flex flex-row gap-4 justify-stretch items-stretch",
        className
      )}
      {...props}
      ref={ref}
    >
      {genders.map((gender) => (
        <RadioGroupItemWithLabel
          key={gender}
          value={gender}
          label={getGenderLabel(gender)}
          className={cn(props.value === gender && "border-primary")}
        />
      ))}
    </RadioGroup>
  );
});

GenderSwitch.displayName = "GenderSwitch";

export { GenderSwitch };
