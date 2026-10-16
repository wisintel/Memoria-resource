const atlasChatSendLimit = 20;
const atlasChatSendWindowSeconds = 60;

type UpstashPipelineResponseItem = {
  error?: string;
  result?: unknown;
};

export async function assertAtlasChatSendRateLimit(userId: string) {
  const config = getUpstashRestConfig();

  if (!config) {
    return;
  }

  const windowId = Math.floor(Date.now() / (atlasChatSendWindowSeconds * 1000));
  const key = `atlas:chat:send:${userId}:${windowId}`;
  const response = await fetch(`${config.url}/pipeline`, {
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, atlasChatSendWindowSeconds],
    ]),
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Atlas chat rate limit check failed.");
  }

  const payload = (await response.json()) as UpstashPipelineResponseItem[];
  const error = payload.find((item) => item.error)?.error;

  if (error) {
    throw new Error("Atlas chat rate limit check failed.");
  }

  const count = Number(payload[0]?.result ?? 0);

  if (Number.isFinite(count) && count > atlasChatSendLimit) {
    throw new Error("Atlas is receiving messages too quickly. Try again in a minute.");
  }
}

function getUpstashRestConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return {
    token,
    url: url.replace(/\/+$/, ""),
  };
}
