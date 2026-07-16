import * as React from "react"

import { cn } from "@booking/ui/lib/utils"

/**
 * DELIBERATE DEVIATION FROM THE SHADCN REGISTRY — do not let `shadcn add` silently
 * revert it. The registry ships a 36px control; every form control in this product
 * is 44px, the WCAG 2.5.8 / Apple HIG minimum touch target. Setting it here rather
 * than at each call site is what keeps it true. Textareas grow, so they take a floor rather than a fixed height.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-28 w-full rounded-md border border-input bg-transparent px-4 py-3 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
