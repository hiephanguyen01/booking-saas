"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@booking/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@booking/ui/components/ui/dropdown-menu"

/** Light / dark / system theme switch backed by `next-themes`. */
export function ModeToggle() {
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Chuyển giao diện sáng/tối">
          <SunIcon className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Sáng</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Tối</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>Hệ thống</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
