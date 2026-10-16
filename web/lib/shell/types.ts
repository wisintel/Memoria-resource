// M2 stub scaffolding — NOT the canonical data model. Replaced by real
// per-surface shapes in M4-M7. Keep this minimal on purpose.
import type {
  ShelfClassKey,
  ShelfClassOption,
  ShelfItem as LoadedShelfItem,
} from "@/domain/shelf";

export type { ShelfClassKey, ShelfClassOption } from "@/domain/shelf";

export type ShelfItem = Omit<LoadedShelfItem, "classKey"> & {
  id: string;
  title: string;
  meta?: string;
  classKey?: ShelfClassKey;
};
export type ShelfContainer = { id: string; label: string };
export type SurfaceShelf = {
  surface: string;
  title: string;
  classOptions?: ShelfClassOption[];
  containers?: ShelfContainer[];
  items: ShelfItem[];
  emptyHint?: string;
};
