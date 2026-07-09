"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Wraps `next-themes` with the class strategy the theme tokens in
 * `globals.css` (`.dark`) expect. Render once near the app root; pair with
 * `<ModeToggle />` for the switch. Add `suppressHydrationWarning` to `<html>`.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
