import { z } from "zod";

import {
  DESCRIPTION_REQUIRED,
  DIRECTION_REQUIRED,
  EFFECTIVE_FROM_REQUIRED,
  ITEM_TYPE_CODE_REQUIRED,
  ITEM_TYPE_NAME_REQUIRED,
  ITEM_TYPE_REQUIRED,
  PRICE_REQUIRED,
  SUPPLIER_NAME_REQUIRED,
} from "@/lib/item-master-messages";
import { ValidationError } from "@/server/errors";

/**
 * Every input crossing into `src/server/items/`, parsed at the edge
 * (`docs/architecture.md` § Validation). Pure: no Prisma, no database, no clock — which
 * is why AC-8's and AC-16's schema halves run in `npm run test:unit` on a machine with no
 * Postgres at all (AC-32).
 *
 * Two properties are load-bearing.
 *
 * A failure is a `ValidationError` carrying the FIELD, so a form can put the message
 * beside the input the admin got wrong and keep everything else they typed. A bare
 * `ZodError` reaching a screen would be a Zod string on a screen, which AC-29 forbids as
 * surely as a Postgres one.
 *
 * A price is a STRING from the browser to Postgres. `Decimal(18, 8)` holds ten digits
 * before the point and eight after; the schema below rejects anything wider rather than
 * letting Postgres round it, and it never converts through `Number` — `6.11764706` is the
 * value #5 fought for, and a float round trip is what loses it.
 */

/* -------------------------------------------------------------- shared primitives */

/** Trimmed, and rejected when nothing is left. Internal whitespace is preserved (AC-7). */
const trimmedNonEmpty = z.string().transform((value) => value.trim()).pipe(z.string().min(1));

/** Trimmed; `""` becomes `null`, because "the admin cleared the box" means "not set". */
const trimmedOrNull = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

/**
 * `Decimal(18, 8)`: at most 10 digits before the point and 8 after. No sign, because a
 * negative price is not a price; no exponent, because `1e3` is a JavaScript idea.
 */
const DECIMAL_18_8 = /^\d{1,10}(?:\.\d{1,8})?$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-02-31` matches the shape and is not a day. Round-trip it to find out. */
function isRealCalendarDate(text: string): boolean {
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE)
  .refine(isRealCalendarDate);

export const locationCodeSchema = z.enum(["DUBLIN", "CLONMEL"]);
export type LocationCode = z.infer<typeof locationCodeSchema>;

export const moveDirectionSchema = z.enum(["UP", "DOWN"]);
export type MoveDirection = z.infer<typeof moveDirectionSchema>;

export const itemFilterSchema = z.enum(["active", "needs-review", "notes", "archived"]);
export type ItemFilter = z.infer<typeof itemFilterSchema>;

/* ------------------------------------------------------------------------ schemas */

export const itemInputSchema = z.object({
  description: trimmedNonEmpty,
  supplierId: trimmedOrNull,
  itemTypeId: trimmedNonEmpty,
  unitLabel: trimmedOrNull,
  notes: trimmedOrNull,
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const priceInputSchema = z.object({
  itemId: trimmedNonEmpty,
  unitPrice: z.string().regex(DECIMAL_18_8),
  effectiveFrom: isoDateSchema,
  label: trimmedOrNull,
});
export type PriceInput = z.infer<typeof priceInputSchema>;

export const supplierNameSchema = z.object({ name: trimmedNonEmpty });
export type SupplierNameInput = z.infer<typeof supplierNameSchema>;

export const itemTypeInputSchema = z.object({
  code: trimmedNonEmpty,
  name: trimmedNonEmpty,
});
export type ItemTypeInput = z.infer<typeof itemTypeInputSchema>;

export const itemListQuerySchema = z.object({
  q: trimmedOrNull,
  filter: itemFilterSchema.catch("active"),
  supplierId: trimmedOrNull,
  itemTypeId: trimmedOrNull,
  locationCode: z
    .union([locationCodeSchema, z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value === "" || value === undefined ? null : value))
    .catch(null),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

/* --------------------------------------------------------------- the parse helpers */

/**
 * The message for each field. Zod's own text ("String must contain at least 1
 * character(s)") is a library's voice; these are the product's, and AC-28 requires the
 * screen and the test to read the same literal.
 */
const MESSAGE_BY_FIELD: Record<string, string> = {
  description: DESCRIPTION_REQUIRED,
  itemTypeId: ITEM_TYPE_REQUIRED,
  unitPrice: PRICE_REQUIRED,
  effectiveFrom: EFFECTIVE_FROM_REQUIRED,
  name: SUPPLIER_NAME_REQUIRED,
  code: ITEM_TYPE_CODE_REQUIRED,
  direction: DIRECTION_REQUIRED,
};

function fieldOf(issue: { path: PropertyKey[] }, fallback: string): string {
  const [first] = issue.path;
  return typeof first === "string" && first !== "" ? first : fallback;
}

/**
 * `schema.parse`, with a `ValidationError` instead of a `ZodError`.
 *
 * `fallbackField` names the field when the schema is a bare value rather than an object,
 * so `ValidationError.field` is never empty and a form always knows where to put the
 * message.
 */
function parseOrThrow<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  fallbackField: string,
  overrides: Record<string, string> = {},
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const [issue] = result.error.issues;
  const field = issue === undefined ? fallbackField : fieldOf(issue, fallbackField);
  const message = overrides[field] ?? MESSAGE_BY_FIELD[field] ?? `${field} is not valid.`;

  throw new ValidationError(field, message);
}

export function parseItemInput(raw: unknown): ItemInput {
  return parseOrThrow(itemInputSchema, raw, "description");
}

export function parsePriceInput(raw: unknown): PriceInput {
  return parseOrThrow(priceInputSchema, raw, "unitPrice");
}

export function parseSupplierName(raw: unknown): SupplierNameInput {
  return parseOrThrow(supplierNameSchema, raw, "name");
}

export function parseItemTypeInput(raw: unknown): ItemTypeInput {
  // `name` means a different thing here than it does on a supplier, so it says so.
  return parseOrThrow(itemTypeInputSchema, raw, "code", { name: ITEM_TYPE_NAME_REQUIRED });
}

export function parseLocationCode(raw: unknown): LocationCode {
  return parseOrThrow(locationCodeSchema, raw, "locationCode");
}

export function parseMoveDirection(raw: unknown): MoveDirection {
  return parseOrThrow(moveDirectionSchema, raw, "direction");
}

/**
 * The list query never refuses: a hand-edited `?filter=nonsense` shows the default list
 * rather than an error page. A query string is a navigation, not a submission, and there
 * is no field on the screen to put a message beside.
 */
export function parseItemListQuery(raw: Record<string, string | string[] | undefined>): ItemListQuery {
  const first = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return itemListQuerySchema.parse({
    q: first("q"),
    filter: first("filter") ?? "active",
    supplierId: first("supplierId"),
    itemTypeId: first("itemTypeId"),
    locationCode: first("locationCode"),
  });
}
