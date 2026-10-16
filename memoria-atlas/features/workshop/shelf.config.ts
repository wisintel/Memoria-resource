import type { ShelfClassOption } from "@/domain/shelf";

export const workshopShelf = {
  title: "Workshop",
  classOptions: [
    { id: "document", label: "Documents" },
    { id: "subject", label: "Subjects" },
    { id: "relationship", label: "Relationships" },
    { id: "type", label: "Types" },
  ] satisfies ShelfClassOption[],
  emptyHint: "No documents match this shelf filter.",
};
