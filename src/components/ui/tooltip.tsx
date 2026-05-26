"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLDivElement | null>;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltip() {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) throw new Error("Tooltip components must be used within <Tooltip>");
  return ctx;
}

interface TooltipProps {
  children: React.ReactNode;
  delayDuration?: number;
}

function Tooltip({ children, delayDuration = 300 }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef }),
    [open]
  );

  const handleMouseEnter = React.useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(true), delayDuration);
  }, [delayDuration]);

  const handleMouseLeave = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(false);
  }, []);

  return (
    <TooltipContext.Provider value={value}>
      <div
        className="relative inline-flex"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { triggerRef } = useTooltip();
  return (
    <div
      ref={triggerRef}
      className={cn("inline-flex cursor-default", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function TooltipContent({
  children,
  className,
  side = "top",
  align = "center",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const { open } = useTooltip();

  if (!open) return null;

  const sideClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      role="tooltip"
      className={cn(
        "absolute z-50 animate-fade-in overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
        sideClasses[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
