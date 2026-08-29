import { createHash } from "node:crypto";

export function sha256hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortHash(input: string | Buffer, len = 8): string {
  return sha256hex(input).slice(0, len);
}
