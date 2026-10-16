import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import type { AtlasChatSetupStatus, AtlasViewer } from "@/lib/atlas-chat/types";
import { getAtlasChatSetupStatus } from "@/lib/atlas-chat/setup";

export async function getServerViewer(
  setupStatus?: AtlasChatSetupStatus,
): Promise<AtlasViewer | null> {
  const status = setupStatus ?? (await getAtlasChatSetupStatus());

  if (!status.databaseReady || !status.authReady) {
    return null;
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    return {
      email: session.user.email,
      id: session.user.id,
      image: session.user.image ?? null,
      name: session.user.name,
    };
  } catch {
    return null;
  }
}
