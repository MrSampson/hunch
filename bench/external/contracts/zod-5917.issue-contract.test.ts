import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod/v4";

test("preprocess preserves target optionality without weakening a generic pipe", () => {
  const optionalTarget = z.object({ x: z.preprocess((value) => value, z.number().optional()) });
  const requiredTarget = z.object({ x: z.preprocess((value) => value, z.number()) });
  const genericPipe = z.object({ x: z.pipe(z.transform((value) => value), z.number().optional()) });

  expect(optionalTarget.safeParse({}).success).toBe(true);
  expect(optionalTarget.safeParse({}, { jitless: true }).success).toBe(true);
  expect(requiredTarget.safeParse({}).success).toBe(false);
  expect(genericPipe.safeParse({}).success).toBe(false);
});

test("preprocess exposes the corrected directional contract statically", () => {
  const optionalTarget = z.preprocess((value) => value, z.number().optional());
  const requiredTarget = z.preprocess((value) => value, z.number());

  expectTypeOf<(typeof optionalTarget)["_zod"]["optin"]>().toEqualTypeOf<"optional">();
  expectTypeOf<(typeof optionalTarget)["_zod"]["optout"]>().toEqualTypeOf<"optional">();
  expectTypeOf<(typeof requiredTarget)["_zod"]["optin"]>().toEqualTypeOf<"optional" | undefined>();
  expect(optionalTarget).toBeInstanceOf(z.ZodPipe);
  expect(optionalTarget._zod.def.type).toBe("pipe");
});

test("input JSON Schema follows the corrected missing-key contract", () => {
  const optionalJson = z.toJSONSchema(
    z.object({ x: z.preprocess((value) => value, z.number().optional()) }),
    { io: "input" }
  ) as { required?: string[] };
  const requiredJson = z.toJSONSchema(
    z.object({ x: z.preprocess((value) => value, z.number()) }),
    { io: "input" }
  ) as { required?: string[] };

  expect(optionalJson.required ?? []).not.toContain("x");
  expect(requiredJson.required).toContain("x");
});
