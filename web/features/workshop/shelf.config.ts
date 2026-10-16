import type { SurfaceShelf } from "@/lib/shell/types";

export const workshopShelf = {
  surface: "workshop",
  title: "Workshop",
  classOptions: [
    { id: "document", label: "Documents" },
    { id: "run", label: "Runs" },
    { id: "subject", label: "Subjects" },
  ],
  containers: [
    { id: "all", label: "All" },
    { id: "prepared", label: "Prepared" },
    { id: "intake", label: "Intake" },
  ],
  items: [],
  emptyHint: "No documents match this shelf filter.",
} satisfies SurfaceShelf;
