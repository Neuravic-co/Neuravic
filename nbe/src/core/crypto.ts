import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export const hmacHex = (secret: string, namespace: string, value: string): string =>
  createHmac("sha256", secret).update(`${namespace}\0${value}`).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
