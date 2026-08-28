import { expect, test } from "vitest";
import * as z from "zod/v4";
import * as mini from "zod/mini";

function invertThroughPublicSurface(api: unknown, codec: unknown): unknown {
  const publicApi = api as { invertCodec?: (value: unknown) => unknown };
  const invertible = codec as { invert?: () => unknown };
  if (typeof publicApi.invertCodec === "function") return publicApi.invertCodec(codec);
  if (typeof invertible.invert === "function") return invertible.invert();
  throw new Error("codec inversion is not exposed through the public API");
}

test("classic codec inversion swaps both directions and composes", () => {
  const original = z.codec(z.int(), z.string().regex(/^\d+$/), {
    decode: (value) => value.toString(),
    encode: (value) => Number.parseInt(value, 10),
  });
  const inverted = invertThroughPublicSurface(z, original) as z.ZodType;

  expect(inverted).not.toBe(original);
  expect(z.decode(inverted, "42")).toBe(42);
  expect(z.encode(inverted, 42)).toBe("42");
  expect(z.object({ age: inverted }).parse({ age: "7" })).toEqual({ age: 7 });

  // Deriving the inverse must not mutate the codec it came from.
  expect(z.decode(original, 9)).toBe("9");
  expect(z.encode(original, "9")).toBe(9);
});

test("mini exposes the same inversion capability", () => {
  const original = mini.codec(mini.int(), mini.string().check(mini.regex(/^\d+$/)), {
    decode: (value) => value.toString(),
    encode: (value) => Number.parseInt(value, 10),
  });
  const inverted = invertThroughPublicSurface(mini, original) as mini.ZodMiniType;

  expect(inverted).not.toBe(original);
  expect(mini.decode(inverted, "42")).toBe(42);
  expect(mini.encode(inverted, 42)).toBe("42");
  expect(mini.decode(original, 9)).toBe("9");
  expect(mini.encode(original, "9")).toBe(9);
});
