/* HUNCH_ISSUE_CONTRACT_TYPECHECK: this issue's behavior is a public compile-time rejection. */
import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod/v4";
import * as mini from "zod/mini";

const classicValid = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("article"), title: z.string() }),
  z.object({ kind: z.literal("video"), duration: z.number() }),
]);
type ClassicInput = z.input<typeof classicValid>;

const miniValid = mini.discriminatedUnion("kind", [
  mini.object({ kind: mini.literal("article"), title: mini.string() }),
  mini.object({ kind: mini.literal("video"), duration: mini.number() }),
]);
type MiniInput = mini.input<typeof miniValid>;

// The issue is specifically that an option lacking the requested discriminator
// was accepted by TypeScript and failed only later at runtime. Both public
// bundles must reject that shape at the call site.
// @ts-expect-error every classic option must statically contain the discriminator
z.discriminatedUnion("kind", [z.object({ title: z.string() })]);
// @ts-expect-error every mini option must statically contain the discriminator
mini.discriminatedUnion("kind", [mini.object({ title: mini.string() })]);

test("valid classic discriminated unions retain precise input and runtime behavior", () => {
  expectTypeOf<ClassicInput>().toEqualTypeOf<
    { kind: "article"; title: string } | { kind: "video"; duration: number }
  >();
  expect(classicValid.parse({ kind: "article", title: "evidence" })).toEqual({
    kind: "article",
    title: "evidence",
  });
  expect(classicValid.safeParse({ kind: "missing", title: "evidence" }).success).toBe(false);
});

test("mini preserves the same valid-option boundary", () => {
  expectTypeOf<MiniInput>().toEqualTypeOf<
    { kind: "article"; title: string } | { kind: "video"; duration: number }
  >();
  expect(miniValid.parse({ kind: "video", duration: 12 })).toEqual({ kind: "video", duration: 12 });
  expect(miniValid.safeParse({ kind: "missing", duration: 12 }).success).toBe(false);
});
