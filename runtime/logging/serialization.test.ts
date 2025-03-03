import { assertEquals } from "@std/assert";
import { serializeConsoleArgumentsToString } from "./serialization.ts";

Deno.test("serializeConsoleArgumentsToString", () => {
  const text = serializeConsoleArgumentsToString(["hello", "world", null, undefined, true, false, 1234]);
  assertEquals(text, "hello world null undefined true false 1234\n");
});

Deno.test("serializeConsoleArgumentsToString handles objects", () => {
  const text = serializeConsoleArgumentsToString(["hello", { a: 5, b: { c: 6 } }]);
  assertEquals(text, 'hello {"a":5,"b":{"c":6}}\n');
});

Deno.test("serializeConsoleArgumentsToString handles objects", () => {
  const text = serializeConsoleArgumentsToString([function foo() {}, () => {}]);
  assertEquals(text, "[Function: foo] [Function (anonymous)]\n");
});

Deno.test("serializeConsoleArgumentsToString handles errors", () => {
  const err = new Error("Test");
  const text = serializeConsoleArgumentsToString([err]);
  assertEquals(text, `${err.stack}\n`);
});

Deno.test("serializeConsoleArgumentsToString handles Sets", () => {
  const sInner = new Set([7]);
  const s = new Set<unknown>([5, 6, sInner, new Set([sInner])]);
  const text = serializeConsoleArgumentsToString([s]);
  assertEquals(text, `Set(4) { 5, 6, Set(1) { 7 }, Set(1) { Set(1) { 7 } } }\n`);
});

Deno.test("serializeConsoleArgumentsToString handles recursive Sets", () => {
  const s = new Set<unknown>([5, 6]);
  s.add(s);
  const text = serializeConsoleArgumentsToString([s]);
  assertEquals(text, `Set(3) { 5, 6, [Circular reference] }\n`);
});

Deno.test("serializeConsoleArgumentsToString handles Maps", () => {
  const m = new Map<string, unknown>([["a", 5], ["b", new Map([["c", 6]])]]);
  m.set("bb", m.get("b"));
  const text = serializeConsoleArgumentsToString([m]);
  assertEquals(text, `Map(3) { "a" => 5, "b" => Map(1) { "c" => 6 }, "bb" => Map(1) { "c" => 6 } }\n`);
});

Deno.test("serializeConsoleArgumentsToString handles recursive Maps", () => {
  const m = new Map<string, unknown>([["a", 5]]);
  m.set("b", m);
  const text = serializeConsoleArgumentsToString([m]);
  assertEquals(text, `Map(2) { "a" => 5, "b" => [Circular reference] }\n`);
});

Deno.test("serializeConsoleArgumentsToString handles unserializable values", () => {
  // deno-lint-ignore no-explicit-any
  const selfReferencingObject: any = { a: 5 };
  selfReferencingObject.b = selfReferencingObject;
  const text = serializeConsoleArgumentsToString(["hello", selfReferencingObject]);
  assertEquals(text, "hello [Unserializable value]\n");
});

Deno.test("serializeConsoleArgumentsToString handles WeakMaps", () => {
  const wm = new WeakMap();
  const text = serializeConsoleArgumentsToString([wm]);
  assertEquals(text, `[object WeakMap]\n`);
});

Deno.test("serializeConsoleArgumentsToString handles Symbols", () => {
  const s = Symbol("test");
  const text = serializeConsoleArgumentsToString([s]);
  assertEquals(text, `Symbol(test)\n`);
});

Deno.test("serializeConsoleArgumentsToString handles BigInts", () => {
  const text = serializeConsoleArgumentsToString([1234n]);
  assertEquals(text, `1234n\n`);
});
