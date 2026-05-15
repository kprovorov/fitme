import type * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import type * as React from "react";
import {
  RadioGroup,
  RadioGroupItemWithLabel,
} from "~/components/ui/radio-group";
import { getGenderLabel } from "~/lib/labels";
import { genders } from "~/lib/models";
import { cn } from "~/lib/utils";

const GenderSwitch = ({
  className,
  ref,
  ...props
}: RadioGroupPrimitive.RootProps & {
  ref?: React.RefObject<RadioGroupPrimitive.RootRef | null>;
}) => (
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

GenderSwitch.displayName = "GenderSwitch";

export { GenderSwitch };
