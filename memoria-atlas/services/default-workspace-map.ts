import { and, eq } from "drizzle-orm";

import { db } from "@/data/client";
import type { CanonicalObjectTransaction } from "@/data/queries/canonical-objects";
import {
  domainMaps,
  objectDomainMemberships,
  objects,
} from "@/data/schema";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";

export const defaultWorkspaceMapLabel = "Workspace";
export const defaultWorkspaceMapMetadata = {
  isDefaultWorkspace: true,
  isWip: true,
};

type DefaultWorkspaceMapRegistry = {
  classId: string;
  statusId: string | null;
};

type InsertDefaultWorkspaceMapInput = {
  domainId: string;
  domainSlug: string;
  registry: DefaultWorkspaceMapRegistry;
  tx: CanonicalObjectTransaction;
};

export function defaultWorkspaceMapSlug(domainSlug: string, domainId: string) {
  return `${domainSlug}-workspace-${domainId.slice(0, 8)}`;
}

export async function getDefaultWorkspaceMapRegistry(): Promise<DefaultWorkspaceMapRegistry> {
  const mapClass = await getClassByKey("domain_map");

  if (!mapClass) {
    throw new Error("Domain Map class is not registered.");
  }

  const defaultStatus = await getDefaultStatusForClass(mapClass.id);

  return {
    classId: mapClass.id,
    statusId: defaultStatus?.id ?? null,
  };
}

export async function insertDefaultWorkspaceMap({
  domainId,
  domainSlug,
  registry,
  tx,
}: InsertDefaultWorkspaceMapInput) {
  const [objectRow] = await tx
    .insert(objects)
    .values({
      classId: registry.classId,
    })
    .returning({ id: objects.id });

  if (!objectRow) {
    throw new Error("Default workspace map object insert failed");
  }

  await tx.insert(objectDomainMemberships).values({
    domainId,
    objectId: objectRow.id,
  });

  await tx.insert(domainMaps).values({
    id: objectRow.id,
    slug: defaultWorkspaceMapSlug(domainSlug, domainId),
    label: defaultWorkspaceMapLabel,
    description: "",
    metadata: defaultWorkspaceMapMetadata,
    statusId: registry.statusId,
  });

  return objectRow.id;
}

export async function ensureDefaultWorkspaceMap(
  domainId: string,
  domainSlug: string
) {
  const existing = await db
    .select({ id: domainMaps.id })
    .from(domainMaps)
    .innerJoin(
      objectDomainMemberships,
      eq(objectDomainMemberships.objectId, domainMaps.id)
    )
    .where(
      and(
        eq(objectDomainMemberships.domainId, domainId),
        eq(objectDomainMemberships.membershipState, "member"),
        eq(domainMaps.slug, defaultWorkspaceMapSlug(domainSlug, domainId))
      )
    )
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  const registry = await getDefaultWorkspaceMapRegistry();

  return db.transaction((tx) =>
    insertDefaultWorkspaceMap({
      domainId,
      domainSlug,
      registry,
      tx,
    })
  );
}
