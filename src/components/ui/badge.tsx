// Badge component — co-theme based design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const variantClass: Record<BadgeVariant, string> = {
  default: "co-badge co-badge-default",
  secondary: "co-badge co-badge-secondary",
  destructive: "co-badge co-badge-danger",
  outline: "co-badge border", // border from Tailwind keeps layout-only border
  success: "co-badge co-badge-success",
  warning: "co-badge co-badge-warning",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantCls = variantClass[variant] ?? variantClass.default;
  return <div className={cn(variantCls, className)} {...props} />;
}

export { Badge };
