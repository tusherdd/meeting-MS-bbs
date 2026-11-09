import { Semaphore } from './pdf.service';

describe('Semaphore (max concurrent PDF renders)', () => {
  it('never runs more than the limit at the same time', async () => {
    const limit = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const task = () =>
      limit.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return 'ok';
      });
    const results = await Promise.all(Array.from({ length: 7 }, task));
    expect(results).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it('releases the slot when a task fails', async () => {
    const limit = new Semaphore(1);
    await expect(
      limit.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(limit.run(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
