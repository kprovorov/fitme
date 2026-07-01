import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { Pressable } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "group flex items-center justify-center web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary web:hover:opacity-90 active:opacity-90",
        destructive: "bg-destructive web:hover:opacity-90 active:opacity-90",
        outline:
          "border border-input bg-background web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent",
        secondary: "bg-secondary web:hover:opacity-80 active:opacity-80",
        ghost:
          "web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent",
        link: "",
      },
      size: {
        sm: "h-9 px-3 py-1.5",
        default: "h-12 px-4 py-2",
        lg: "h-14 px-6 py-3",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
        "icon-xs": "h-8 w-8",
      },
      shape: {
        pill: "rounded-full",
        default: "",
      },
    },
    compoundVariants: [
      {
        size: "sm",
        shape: "default",
        class: "rounded-sm",
      },
      {
        size: "default",
        shape: "default",
        class: "rounded-md",
      },
      {
        size: "lg",
        shape: "default",
        class: "rounded-lg",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  }
);

const buttonTextVariants = cva(
  "web:whitespace-nowrap font-nunito-sans-bold native:text-body text-foreground text-subhead web:transition-colors",
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-destructive-foreground",
        outline: "group-active:text-accent-foreground",
        secondary:
          "text-secondary-foreground group-active:text-secondary-foreground",
        ghost: "group-active:text-accent-foreground",
        link: "text-primary group-active:text-primary/80",
      },
      size: {
        default: "native:text-body",
        sm: "native:text-subhead",
        lg: "native:text-title-3",
        icon: "",
        "icon-sm": "native:text-subhead",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

const Button = ({
  className,
  variant,
  size,
  shape,
  ref,
  ...props
}: ButtonProps & {
  ref?: React.RefObject<React.ElementRef<typeof Pressable> | null>;
}) => (
  <TextClassContext.Provider
    value={buttonTextVariants({
      variant,
      size,
      className: "web:pointer-events-none font-nunito-sans-bold",
    })}
  >
    <Pressable
      className={cn(
        props.disabled && "web:pointer-events-none opacity-50",
        buttonVariants({ variant, size, shape, className })
      )}
      ref={ref}
      role="button"
      {...props}
    />
  </TextClassContext.Provider>
);
Button.displayName = "Button";

export type { ButtonProps };
export { Button, buttonTextVariants, buttonVariants };
