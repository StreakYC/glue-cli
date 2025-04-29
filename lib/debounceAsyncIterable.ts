import { delay } from "@std/async/delay";

/**
 * Creates a new debounced version of the original async iterable that yields a
 * value only after a period of `wait` milliseconds have passed without any
 * events. The yielded value is an array of all the values that were received
 * since the last array was yielded.
 */
export async function* debounceAsyncIterable<T>(
  iterable: AsyncIterable<T, unknown, void>,
  wait: number,
): AsyncIterable<T[], void, void> {
  let iteratorIsDone = false;
  const sourceIterator = iterable[Symbol.asyncIterator]();

  try {
    let nextPromise = sourceIterator.next();
    let buffer: T[] = [];
    while (true) {
      let result: IteratorResult<T, unknown> | void;
      if (buffer.length === 0) {
        result = await nextPromise;
      } else {
        const abortController = new AbortController();
        try {
          result = await Promise.race([
            nextPromise,
            delay(wait, { signal: abortController.signal }),
          ]);
        } finally {
          // abort the delay in case nextPromise resolved or rejected first
          abortController.abort();
        }
      }
      if (result === undefined) { // delay timeout
        if (buffer.length > 0) {
          yield buffer;
          buffer = [];
        }
      } else if (result.done) {
        iteratorIsDone = true;
        if (buffer.length > 0) {
          yield buffer;
        }
        return;
      } else {
        buffer.push(result.value);
        nextPromise = sourceIterator.next();
      }
    }
  } finally {
    if (!iteratorIsDone) {
      await sourceIterator.return?.();
    }
  }
}
