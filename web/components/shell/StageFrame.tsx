import type { ReactNode } from "react";

export function StageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="h-full min-h-0 overflow-auto bg-background">
      {children}
    </main>
  );
}
