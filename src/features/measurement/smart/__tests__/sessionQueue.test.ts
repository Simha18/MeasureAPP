import { expect, it } from 'vitest';
import { createSessionQueue } from '../sessionQueue';

it('finishes an old capture and teardown before starting a new AR screen', async () => {
  const enqueue = createSessionQueue();
  const calls: string[] = [];
  let finishCapture!: () => void;
  const pending = new Promise<void>(resolve => { finishCapture = resolve; });
  const capture = enqueue(async () => { calls.push('capture'); await pending; calls.push('captured'); });
  const stop = enqueue(async () => { calls.push('stop'); });
  const start = enqueue(async () => { calls.push('start'); });
  await Promise.resolve(); await Promise.resolve();
  expect(calls).toEqual(['capture']);
  finishCapture();
  await Promise.all([capture, stop, start]);
  expect(calls).toEqual(['capture', 'captured', 'stop', 'start']);
});

it('does not block a new session when teardown fails', async () => {
  const enqueue = createSessionQueue();
  const failure = enqueue(async () => { throw new Error('Session already closed'); });
  const next = enqueue(async () => 'started');
  await expect(failure).rejects.toThrow('Session already closed');
  await expect(next).resolves.toBe('started');
});
