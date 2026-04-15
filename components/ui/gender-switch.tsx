import type * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import * as React from "react";
import {
  RadioGroup,
  RadioGroupItemWithLabel,
} from "~/components/ui/radio-group";
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
        "flex flex-row items-stretch justify-stretch gap-4",
        className
      )}
      {...props}
      ref={ref}
    >
      {genders.map((gender) => (
        <RadioGroupItemWithLabel
          className={cn(props.value === gender && "border-primary")}
          key={gender}
          label={getGenderLabel(gender)}
          value={gender}
        />
      ))}
    </RadioGroup>
  );
});

GenderSwitch.displayName = "GenderSwitch";

export { GenderSwitch };
