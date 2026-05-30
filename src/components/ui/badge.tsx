import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        // Project Status
        active: "border-green-border bg-green-dim text-text-green",
        onhold: "border-gold-border bg-accent-gold-dim text-accent-gold",
        "on-hold": "border-gold-border bg-accent-gold-dim text-accent-gold",
        completed: "border-[#2a3a5a] bg-[#1a1a2a] text-[#6688CC]",
        // Assignment Status
        high: "bg-brand-red-dim text-text-red",
        medium: "bg-accent-gold-dim text-accent-gold",
        low: "bg-[#1f1f1f] text-[#888]",
        scheduled: "border-[#333] bg-[#1f1f1f] text-[#888]",
        inprogress: "border-accent-gold/50 bg-accent-gold-dim text-accent-gold",
        "checked-out": "border-border-sub bg-bg-tertiary text-text-primary",
        missed: "border-border-red bg-brand-red-dim text-text-red",
        pending: "border-accent-gold/50 bg-accent-gold-dim text-accent-gold",
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