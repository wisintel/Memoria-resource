import { and, eq } from "drizzle-orm";
import { db } from "@/data/client";
import { classes, statuses } from "@/data/schema";

export async function getClassByKey(key: string) {
  const [classRow] = await db
    .select()
    .from(classes)
    .where(eq(classes.key, key))
    .limit(1);

  return classRow ?? null;
}

export async function getDefaultStatusForClass(classId: string) {
  const [statusRow] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.classId, classId), eq(statuses.isDefault, true)))
    .limit(1);

  return statusRow ?? null;
}

export async function getStatusForClassByKey(classId: string, key: string) {
  const [statusRow] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.classId, classId), eq(statuses.key, key)))
    .limit(1);

  return statusRow ?? null;
}
