/**
 * v1.17 part 3 (SPEC.md §13.6a): which form fields are required, derived from the form's zod
 * schema so the red "*" + "আবশ্যক" / "Required" mark always matches the validation.
 *
 * Rule: a field is required when its own schema rejects an empty value (""). Fields that accept
 * "" (optional text, an optional select with an empty option) are not required. Object-level
 * refinements (e.g. "passwords match") are not looked at; give such a field its own `.min(1)`.
 * v1.19: a checkbox (a field that accepts both true and false, e.g. `minutesRequired`) is never required.
 */
import type { z } from "zod";

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;
export type RequiredMap<S extends AnyObjectSchema> = Record<
  Extract<keyof S["shape"], string>,
  boolean
>;

const cache = new WeakMap<AnyObjectSchema, Record<string, boolean>>();

/** `{ fieldName: true | false }` for every field of an object schema (cached per schema). */
export function requiredFields<S extends AnyObjectSchema>(schema: S): RequiredMap<S> {
  let map = cache.get(schema);
  if (!map) {
    map = {};
    for (const [key, field] of Object.entries(schema.shape)) {
      const f = field as z.ZodType;
      const checkbox = f.safeParse(true).success && f.safeParse(false).success;
      map[key] = !checkbox && !f.safeParse("").success;
    }
    cache.set(schema, map);
  }
  return map as RequiredMap<S>;
}
