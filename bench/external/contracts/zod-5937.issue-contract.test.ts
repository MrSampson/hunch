import { expect, test } from "vitest";
import * as z from "zod/v4";

test("catch handles absent keys in normal and jitless object parsing", () => {
  const target = z.object({
    area: z.preprocess((value) => (value ? value.toString().split(",") : []), z.array(z.string())).catch([]),
  });
  const plain = z.object({ x: z.string().catch("caught") });

  expect(target.parse({})).toEqual({ area: [] });
  expect(target.parse({}, { jitless: true })).toEqual({ area: [] });
  expect(plain.parse({})).toEqual({ x: "caught" });
  expect(plain.parse({}, { jitless: true })).toEqual({ x: "caught" });
});

test("an outer optional still wins after catch handles the missing value", async () => {
  const sync = z.object({ x: z.string().catch("caught").optional() });
  const asyncInner = z.string().refine(async () => false).catch("caught").optional();
  const asyncSchema = z.object({ x: asyncInner });

  expect(sync.parse({})).toEqual({});
  expect(sync.parse({ x: undefined })).toEqual({ x: undefined });
  expect(await asyncSchema.parseAsync({})).toEqual({});
  expect(await asyncSchema.parseAsync({ x: "bad" })).toEqual({ x: "caught" });
});

test("input JSON Schema makes catch fields optional but not ordinary strings", () => {
  const json = z.toJSONSchema(
    z.object({ caught: z.string().catch("caught"), required: z.string() }),
    { io: "input" }
  ) as { required?: string[] };

  expect(json.required ?? []).not.toContain("caught");
  expect(json.required).toContain("required");
});
