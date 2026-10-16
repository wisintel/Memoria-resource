export type ShelfClassKey =
  | "document"
  | "subject"
  | "claim"
  | "relationship"
  | "evidence"
  | "domain_map"
  | "bundle"
  | "run"
  | "type";

export type ShelfClassOption = { id: ShelfClassKey; label: string };

export type ShelfItem = {
  id: string;
  title: string;
  classKey: ShelfClassKey;
  badgeLabel?: string;
  children?: ShelfItem[];
  groupKey?: string;
  groupLabel?: string;
  isOnActiveMap?: boolean;
  meta?: string;
  weight?: number;
};

export type ShelfDragItem = Pick<ShelfItem, "classKey" | "id" | "title">;

export type DocumentShelfFolder = {
  id: string;
  label: string;
  position: number;
  collapsed: boolean;
};

export type DocumentShelfFolderItem = {
  folderId: string;
  itemId: string;
  position: number;
};

export type DocumentShelfFolders = {
  folders: DocumentShelfFolder[];
  folderItems: DocumentShelfFolderItem[];
};

export type ShelfItemsResponse = {
  items: ShelfItem[];
  folders?: DocumentShelfFolder[];
  folderItems?: DocumentShelfFolderItem[];
};

export const shelfDragDataType = "application/x-project-memoria-shelf-item";

export const shelfClassKeys = [
  "document",
  "subject",
  "claim",
  "relationship",
  "evidence",
  "domain_map",
  "bundle",
  "run",
  "type",
] as const satisfies readonly ShelfClassKey[];

export function isShelfClassKey(value: string): value is ShelfClassKey {
  return shelfClassKeys.includes(value as ShelfClassKey);
}
