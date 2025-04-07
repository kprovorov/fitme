import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import * as React from "react";
import { RadioGroupItemWithLabel } from "~/components/ui/radio-group";
import { RadioGroup } from "~/components/ui/radio-group";
import { cn } from "~/lib/utils";

const options = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

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
      {options.map((option) => (
        <RadioGroupItemWithLabel
          key={option.value}
          value={option.value}
          label={option.label}
        />
      ))}
    </RadioGroup>
  );
});

GenderSwitch.displayName = "GenderSwitch";

export { GenderSwitch };
