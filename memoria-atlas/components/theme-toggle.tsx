"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Theme</span>
      <select
        aria-label="Theme"
        className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        onChange={(event) => setTheme(event.target.value)}
        suppressHydrationWarning
        value={theme ?? "system"}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
