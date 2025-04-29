import { debounceAsyncIterable } from "./debounceAsyncIterable.ts";
import { delay } from "@std/async/delay";
import { assertEquals } from "@std/assert";

Deno.test("basic grouping", async () => {
  const testIterable = (async function* () {
    yield 1;
    yield 2;
    await delay(1);
    yield 3;
    await delay(200);
    yield 4;
    yield 5;
  })();

  const results = await Array.fromAsync(debounceAsyncIterable(testIterable, 100));
  assertEquals(results, [[1, 2, 3], [4, 5]]);
});

Deno.test("can wait multiple wait periods", async () => {
  const testIterable = (async function* () {
    yield 1;
    await delay(60);
    yield 2;
    await delay(60);
    yield 3;
    await delay(60);
    yield 4;
    await delay(200);
    yield 5;
  })();

  const results = await Array.fromAsync(debounceAsyncIterable(testIterable, 100));
  assertEquals(results, [[1, 2, 3, 4], [5]]);
});

Deno.test("return is called after early exit", async () => {
  let testIterableFinallyCalled = false;

  const testIterable = (async function* () {
    try {
      yield 1;
      yield 2;
      await delay(200);
      yield 3;
      await delay(200);
      yield 4;
    } finally {
      testIterableFinallyCalled = true;
    }
  })();

  for await (const value of debounceAsyncIterable(testIterable, 100)) {
    assertEquals(value, [1, 2]);
    break;
  }
  assertEquals(testIterableFinallyCalled, true);
});

Deno.test("wait time passes before first value", async () => {
  const testIterable = (async function* () {
    await delay(200);
    yield 1;
    await delay(50);
    yield 2;
  })();

  const results = await Array.fromAsync(debounceAsyncIterable(testIterable, 100));
  assertEquals(results, [[1, 2]]);
});
