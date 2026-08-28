import { expect, test } from "vitest";
import * as z from "zod/v4";
import * as mini from "zod/mini";

function expectInvalidUnion(result: z.ZodSafeParseResult<unknown>): void {
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues[0]?.code).toBe("invalid_union");
    expect(result.error.issues[0]?.path).toEqual([]);
  }
}

test("empty classic unions and xors behave like never instead of throwing internals", () => {
  const emptyUnion = z.union([]);
  const emptyXor = z.xor([]);

  expect(() => emptyUnion.safeParse("anything")).not.toThrow();
  expect(() => emptyXor.safeParse("anything")).not.toThrow();
  expectInvalidUnion(emptyUnion.safeParse("anything"));
  expectInvalidUnion(emptyXor.safeParse("anything"));

  // The boundary must not weaken ordinary composites.
  const normalUnion = z.union([z.string(), z.number()]);
  expect(normalUnion.parse("value")).toBe("value");
  expect(normalUnion.parse(42)).toBe(42);
  expect(normalUnion.safeParse(false).success).toBe(false);
});

test("Mini exposes the same safe empty-composite behavior", () => {
  const emptyUnion = mini.union([]);
  const emptyXor = mini.xor([]);

  expect(() => mini.safeParse(emptyUnion, "anything")).not.toThrow();
  expect(() => mini.safeParse(emptyXor, "anything")).not.toThrow();
  const unionResult = mini.safeParse(emptyUnion, "anything");
  const xorResult = mini.safeParse(emptyXor, "anything");
  expect(unionResult.success).toBe(false);
  expect(xorResult.success).toBe(false);
  if (!unionResult.success) expect(unionResult.error.issues[0]?.code).toBe("invalid_union");
  if (!xorResult.success) expect(xorResult.error.issues[0]?.code).toBe("invalid_union");

  const normalUnion = mini.union([mini.string(), mini.number()]);
  expect(mini.parse(normalUnion, "value")).toBe("value");
  expect(mini.parse(normalUnion, 42)).toBe(42);
  expect(mini.safeParse(normalUnion, false).success).toBe(false);
});
