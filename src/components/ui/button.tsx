// Button component — co-theme based design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  default: "co-btn co-btn-primary",
  destructive: "co-btn co-btn-destructive",
  outline: "co-btn co-btn-outline",
  secondary: "co-btn co-btn-secondary",
  ghost: "co-btn co-btn-ghost",
  link: "underline-offset-4 hover:underline", // plain text link, keep minimal
};

const sizeClass: Record<ButtonSize, string> = {
  default: "",
  sm: "co-btn-sm",
  lg: "co-btn-lg",
  icon: "co-btn-icon",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantCls = variantClass[variant] ?? variantClass.default;
    const sizeCls = sizeClass[size] ?? "";
    return (
      <button
        className={cn(variantCls, sizeCls, className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
