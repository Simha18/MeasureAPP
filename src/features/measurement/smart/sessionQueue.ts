// The native camera session is a singleton, including across different route instances.
// Teardown must finish before the next screen starts or resets that session.
export function createSessionQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = tail.catch(() => undefined).then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
}

export const queueArOperation = createSessionQueue();
