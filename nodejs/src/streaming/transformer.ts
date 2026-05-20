/**
 * Stream transformation helpers: map and filter over async iterables.
 * Use with data_products.stream(), data_products.replay(), or queues.open_reader().read().
 */

/**
 * Map each item from an async iterable through a transform function.
 * Yields transformed values.
 */
export async function* mapStream<T, U>(
  stream: AsyncIterable<T>,
  transform: (item: T) => U | Promise<U>
): AsyncIterable<U> {
  for await (const item of stream) {
    yield await transform(item);
  }
}

/**
 * Filter items from an async iterable by a predicate.
 * Yields only items for which predicate returns true.
 */
export async function* filterStream<T>(
  stream: AsyncIterable<T>,
  predicate: (item: T) => boolean | Promise<boolean>
): AsyncIterable<T> {
  for await (const item of stream) {
    if (await predicate(item)) {
      yield item;
    }
  }
}
