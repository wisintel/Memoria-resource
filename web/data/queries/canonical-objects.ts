import { sql, type SQL } from "drizzle-orm";
import { db, type DbClient } from "@/data/client";
import { objectDomainMemberships, objects } from "@/data/schema";

type TransactionCallback = Parameters<DbClient["transaction"]>[0];

export type CanonicalObjectTransaction = Parameters<TransactionCallback>[0];

type CreateCanonicalObjectInput<TRecord> = {
  classId: string;
  domainId: string;
  insertRecord: (
    tx: CanonicalObjectTransaction,
    objectId: string
  ) => Promise<TRecord>;
};

type DomainMemberObjectInput = {
  classKey?: string;
  domainSlug: string;
  objectId: string;
};

type DomainMemberObjectRow = {
  id: string;
};

export async function createCanonicalObject<TRecord>({
  classId,
  domainId,
  insertRecord,
}: CreateCanonicalObjectInput<TRecord>) {
  return db.transaction(async (tx) => {
    const [objectRow] = await tx
      .insert(objects)
      .values({
        classId,
      })
      .returning({ id: objects.id });

    if (!objectRow) {
      throw new Error("Canonical object insert failed");
    }

    await tx.insert(objectDomainMemberships).values({
      domainId,
      objectId: objectRow.id,
    });

    const record = await insertRecord(tx, objectRow.id);

    return {
      id: objectRow.id,
      record,
    };
  });
}

export async function getDomainMemberObject({
  classKey,
  domainSlug,
  objectId,
}: DomainMemberObjectInput) {
  const classFilter = classKey ? sql`and classes.key = ${classKey}` : sql``;
  const [row] = (await db.execute(sql`
    select objects.id
    from objects
    join classes on classes.id = objects.class_id
    join object_domain_memberships memberships
      on memberships.object_id = objects.id
    join domains on domains.id = memberships.domain_id
    where objects.id = ${objectId}
      and domains.slug = ${domainSlug}
      and memberships.membership_state = 'member'
      ${classFilter}
    limit 1
  `)) as unknown as DomainMemberObjectRow[];

  return row ?? null;
}

export function domainMemberExistsFilter(objectId: SQL, domainId: string) {
  return sql`
    and exists (
      select 1
      from object_domain_memberships scoped_memberships
      where scoped_memberships.object_id = ${objectId}
        and scoped_memberships.domain_id = ${domainId}
        and scoped_memberships.membership_state = 'member'
    )
  `;
}
