/**
 * The text of a caught value: an Error's message, a `{ message }` object's message (a
 * rejection that is not an Error, as some libraries and test doubles throw), else the
 * value as a string.
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
};
