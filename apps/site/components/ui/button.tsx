import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import {
  type ComponentProps,
  type ComponentType,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SVGProps,
} from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "default" | "lg";
type ButtonShape = "pill" | "circle";
type ButtonIconPosition = "leading" | "trailing";
// Library-independent: pass a Lucide/Tabler component, or an already made icon.
type ButtonIcon = ComponentType<SVGProps<SVGSVGElement>> | ReactElement;

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    compoundVariants: [
      {
        className: "h-(--size-button-pill-sm) px-3",
        shape: "pill",
        size: "sm",
      },
      {
        className: "h-(--size-button-pill-default) px-4",
        shape: "pill",
        size: "default",
      },
      {
        className: "h-(--size-button-pill-lg) px-6",
        shape: "pill",
        size: "lg",
      },
      {
        className: "size-(--size-button-circle-sm)",
        shape: "circle",
        size: "sm",
      },
      {
        className: "size-(--size-button-circle-default)",
        shape: "circle",
        size: "default",
      },
      {
        className: "size-(--size-button-circle-lg)",
        shape: "circle",
        size: "lg",
      },
    ],
    defaultVariants: { shape: "pill", size: "default", variant: "default" },
    variants: {
      shape: { circle: "p-0", pill: "" },
      size: {
        default: "text-body-emphasized",
        lg: "text-title-3-emphasized",
        sm: "text-subhead-emphasized",
      },
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground",
      },
    },
  }
);

type ButtonBaseProps = Omit<ComponentProps<"button">, "children"> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

type PillBaseProps = ButtonBaseProps & {
  icon?: ButtonIcon;
  iconPosition?: ButtonIconPosition;
  shape?: "pill";
};

type PillButtonProps = PillBaseProps & {
  asChild?: false;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

/** Render a link with Button styling; keep its native link semantics. */
type ChildButtonProps = Omit<PillBaseProps, "disabled"> & {
  asChild: true;
  children: ReactElement;
  disabled?: never;
};

type CircleButtonProps = ButtonBaseProps & {
  "aria-label": string;
  asChild?: false;
  children?: never;
  icon: ButtonIcon;
  iconPosition?: never;
  shape: "circle";
};

type ButtonProps = PillButtonProps | ChildButtonProps | CircleButtonProps;

function Button({
  asChild = false,
  children,
  className,
  icon,
  iconPosition = "leading",
  shape = "pill",
  size = "default",
  type,
  variant = "default",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const iconView = icon ? (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none inline-flex shrink-0 items-center justify-center [&_svg]:size-full",
        size === "sm" ? "size-4" : "size-5"
      )}
    >
      {isValidElement(icon) ? icon : createElement(icon)}
    </span>
  ) : null;

  return (
    <Comp
      className={cn(className, buttonVariants({ shape, size, variant }))}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {shape === "circle" || iconPosition === "leading" ? iconView : null}
      <Slottable>{shape === "pill" ? children : null}</Slottable>
      {shape === "pill" && iconPosition === "trailing" ? iconView : null}
    </Comp>
  );
}

export type {
  ButtonIcon,
  ButtonIconPosition,
  ButtonProps,
  ButtonShape,
  ButtonSize,
  ButtonVariant,
  ChildButtonProps,
  CircleButtonProps,
  PillButtonProps,
};
export { Button };
