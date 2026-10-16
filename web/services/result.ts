export type CommandError = {
  code: string;
  message: string;
  details?: unknown;
};

export type CommandResult<T> =
  { ok: true; data: T } | { ok: false; error: CommandError };

export function ok<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}

export function err(
  code: string,
  message: string,
  details?: unknown
): CommandResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}
