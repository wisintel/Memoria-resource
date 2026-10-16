export const maxAtlasChatMessageChars = 8_000;

export function getAtlasChatMessageLength(message: string) {
  return Array.from(message).length;
}

export function getAtlasChatMessageLengthError(message: string) {
  const length = getAtlasChatMessageLength(message);

  if (length > maxAtlasChatMessageChars) {
    return `Message is too long. Keep it under ${maxAtlasChatMessageChars.toLocaleString()} characters.`;
  }

  return null;
}

export function assertAtlasChatMessageLength(message: string) {
  const error = getAtlasChatMessageLengthError(message);

  if (error) {
    throw new Error(error);
  }
}
