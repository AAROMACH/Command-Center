import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { calmClasses } from "@/lib/ui-classes"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-red text-white font-semibold hover:bg-brand-red-hover shadow-sm",
        destructive: "bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90",
        "destructive-outline": "border border-border-red bg-transparent text-text-red font-semibold hover:bg-brand-red-dim",
        outline: "border border-border-main bg-bg-secondary text-text-secondary font-medium hover:bg-bg-tertiary hover:border-text-muted hover:text-text-primary",
        secondary: "bg-transparent border border-accent-gold text-accent-gold font-semibold hover:bg-accent-gold-dim",
        ghost: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        folder: "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-red bg-brand-red-dim px-3 py-1.5 font-semibold text-brand-red transition-all hover:bg-brand-red hover:text-white",
        dashed: "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-default py-4 font-semibold text-text-muted transition-colors hover:border-brand-red hover:text-brand-red"
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

/** Sentence case at a legible size everywhere — see lib/ui-classes.ts. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className: calmClasses(className) }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

    