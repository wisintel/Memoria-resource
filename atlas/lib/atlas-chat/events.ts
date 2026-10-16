import type { HandleMessageStreamEvent } from "eve/client";

export function isAtlasChatTurnSettledEvent(event: HandleMessageStreamEvent) {
  return (
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting"
  );
}
