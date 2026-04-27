import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        // New variants from spec
        high: "bg-brand-red-dim text-text-red",
        medium: "bg-accent-gold-dim text-accent-gold",
        low: "bg-[#1f1f1f] text-[#888]",
        scheduled: "border-[#333] bg-[#1f1f1f] text-[#888]",
        inprogress: "border-[#4a3500] bg-accent-gold-dim text-accent-gold",
        completed: "border-[#0f3a1a] bg-[#0a1f0f] text-text-green",
        missed: "border-border-red bg-brand-red-dim text-text-red",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
