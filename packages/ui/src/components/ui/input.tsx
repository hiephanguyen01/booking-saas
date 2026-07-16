import * as React from "react"

import { cn } from "@booking/ui/lib/utils"

/**
 * DELIBERATE DEVIATION FROM THE SHADCN REGISTRY — do not let `shadcn add input`
 * silently revert it. The registry ships `h-9 px-3` (36px); every form control in
 * this product is 44px, the WCAG 2.5.8 / Apple HIG minimum touch target. Setting
 * it here rather than at each call site is what keeps it true: five different
 * input heights once shipped side by side because the size was opt-in.
 * The sibling controls (native-select, select, input-group, textarea, and
 * button's `control` size) carry the same deviation and must stay in step.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-4 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
