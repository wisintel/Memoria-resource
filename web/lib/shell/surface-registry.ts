import { workshopShelf } from "@/features/workshop/shelf.config";
import type { SurfaceShelf } from "@/lib/shell/types";

export const surfaceShelves: Record<string, SurfaceShelf> = {
  "/workshop": workshopShelf,
};

export function resolveSurfaceShelf(pathname: string): SurfaceShelf | null {
  return surfaceShelves[pathname] ?? null;
}
