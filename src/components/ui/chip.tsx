import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";
import { getTextClassForBackground, hexToRgba } from "../../utils/color";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 truncate max-w-[120px] transition-colors",
  {
    variants: {
      variant: {
        solid: "border border-transparent",
        subtle: "border border-transparent",
        outline: "bg-transparent border-2",
      },
    },
    defaultVariants: {
      variant: "subtle",
    },
  }
);

export interface ChipProps
  extends Omit<React.ComponentProps<"span">, "color">,
    VariantProps<typeof chipVariants> {
  /** Hex color for tag/category. Used for bg (solid), bg/15 (subtle), border+text (outline). */
  color?: string;
  /** When set (e.g. block background hex), text and outline border use contrast against this so chip is readable on colored surfaces. */
  contrastBackgroundHex?: string;
}

function Chip({ className, variant = "subtle", color, contrastBackgroundHex, style, children, ...props }: ChipProps) {
  const isSolid = variant === "solid";
  const isSubtle = variant === "subtle";
  const isOutline = variant === "outline";

  const useContrast = contrastBackgroundHex != null;

  const dynamicStyle: React.CSSProperties = {
    ...style,
    ...(color && isSolid && !useContrast && { backgroundColor: color }),
    ...(color && isSubtle && {
      backgroundColor: hexToRgba(color ?? "#6b7280", 0.15),
      ...(useContrast ? {} : { color: color }),
    }),
    ...(color && isOutline && !useContrast && { borderColor: color, color: color }),
    ...(useContrast && isOutline && { borderColor: "currentColor" }),
  };

  const textClass = useContrast
    ? getTextClassForBackground(contrastBackgroundHex!)
    : isSolid && color
      ? getTextClassForBackground(color)
      : undefined;

  return (
    <span
      data-slot="chip"
      className={cn(chipVariants({ variant }), textClass, className)}
      style={Object.keys(dynamicStyle).length ? dynamicStyle : undefined}
      {...props}
    >
      {children}
    </span>
  );
}

export { Chip, chipVariants };
