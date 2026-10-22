const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBusinessCode(prefix: string, length = 7) {
  const values = new Uint32Array(length);
  globalThis.crypto.getRandomValues(values);
  const suffix = Array.from(
    values,
    (value) => ALPHABET[value % ALPHABET.length],
  ).join("");
  return `${prefix}-${suffix}`;
}
