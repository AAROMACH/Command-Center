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
        // ── Canonical status tag colors (theme-aware, one meaning per color) ──
        // green  = good / active / verified / done-well
        // gold   = attention / pending / in-progress
        // red    = alert / missed / failed
        // blue   = neutral-complete / closed / informational
        // grey   = inactive / low / not-started
        active: "border-green-border bg-green-dim text-text-green",
        onhold: "border-gold-border bg-accent-gold-dim text-accent-gold",
        "on-hold": "border-gold-border bg-accent-gold-dim text-accent-gold",
        completed: "border-blue-500/30 bg-blue-500/10 text-blue-500",
        // Assignment Status
        high: "border-border-red bg-brand-red-dim text-text-red",
        medium: "border-gold-border bg-accent-gold-dim text-accent-gold",
        low: "border-border-sub bg-bg-tertiary text-text-muted",
        scheduled: "border-border-sub bg-bg-tertiary text-text-muted",
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