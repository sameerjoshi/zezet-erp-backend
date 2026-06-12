import { Prisma } from '@prisma/client';

// Serialize a Prisma Decimal money column to a fixed 2-decimal string — the
// stable wire contract the frontend consumes (avoids float drift, keeps the
// key name intact so the global financial gate can still strip it for ops).
export function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  return value == null ? null : value.toFixed(2);
}
