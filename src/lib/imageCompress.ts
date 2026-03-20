/**
 * Strip data URL prefix from a base64 string.
 * Handles data:image/jpeg;base64, data:image/png;base64, etc.
 * Returns raw base64 string.
 */
export function stripDataUrlPrefix(input: string): string {
  return input.replace(/^data:[^;]+;base64,/, "");
}
