import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-red text-white hover:bg-brand-red-hover uppercase tracking-wider font-bold text-xs",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "destructive-outline": "border border-border-red bg-transparent text-text-red hover:bg-brand-red-dim",
        outline: "border border-border-default bg-transparent hover:bg-bg-tertiary hover:text-text-primary uppercase tracking-wider text-xs",
        secondary: "bg-transparent border border-accent-gold text-accent-gold hover:bg-accent-gold-dim uppercase tracking-wider font-bold text-xs",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        folder: "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-red bg-brand-red-dim px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-red transition-all hover:bg-brand-red hover:text-white",
        dashed: "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-default py-4 text-sm font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-brand-red hover:text-brand-red"
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "icon-sm": "h-7 w-7",
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

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

    