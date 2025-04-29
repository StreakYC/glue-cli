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

Deno.test("don't call return on done iterator", async () => {
  // The iterator returned by Deno.watchFs will throw if you call return on it
  // after the FsWatcher is closed (and the iterator has emitted a {done:true}
  // value). This test ensures that we don't do that.

  // Make an iterable like Deno.FsWatcher which throws if its return method is
  // called after it has emitted a {done:true} value.
  function makePickyIterable<T, TReturn, TNext>(iterable: AsyncIterable<T, TReturn, TNext>): AsyncIterable<T, TReturn, TNext> {
    return {
      [Symbol.asyncIterator]() {
        const iterator = iterable[Symbol.asyncIterator]();
        let lastResult: Promise<IteratorResult<T, TReturn>> | undefined;
        return {
          next(...args) {
            lastResult = iterator.next(...args);
            return lastResult;
          },
          async return(...args) {
            if (lastResult) {
              const lastResultValue = await lastResult;
              if (lastResultValue.done) {
                throw new Error("return called on completed picky iterator");
              }
            }
            lastResult = iterator.return ? iterator.return(...args) : Promise.resolve({ done: true } as IteratorResult<T, TReturn>);
            return lastResult;
          },
          throw(...args) {
            lastResult = iterator.throw ? iterator.throw(...args) : Promise.resolve({ done: true } as IteratorResult<T, TReturn>);
            return lastResult;
          },
        };
      },
    };
  }

  async function* testIterable() {
    yield 1;
    yield 2;
    yield 3;
  }

  const results = await Array.fromAsync(debounceAsyncIterable(makePickyIterable(testIterable()), 100));
  assertEquals(results, [[1, 2, 3]]);
});
