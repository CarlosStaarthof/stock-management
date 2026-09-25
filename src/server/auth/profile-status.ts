/**
 * The four states of a profile (021 `ProfileStatus`), declared as a plain string union for
 * the same reason `roles.ts` declares `Role`: only `src/server/db.ts` imports
 * `@prisma/client`. The union is structurally identical to the generated enum, so a value
 * read from the database assigns to it without a cast.
 */
export const PROFILE_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "DEACTIVATED"] as const;

export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
