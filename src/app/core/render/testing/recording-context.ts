/**
 * A fake 2D context that records every method call (with arguments) and every property assignment.
 * jsdom has no canvas, so draw code is checked by what it asks the context to do.
 */
export function recordingContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const num = (v: unknown) => (typeof v === 'number' ? Number(v.toFixed(9)) : v);
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          log.push(`${prop}(${args.map((a) => JSON.stringify(num(a))).join(',')})`);
          // createRadialGradient & co. return something that accepts addColorStop.
          return { addColorStop: () => undefined };
        };
      },
      set(_t, prop: string, value: unknown) {
        log.push(`${prop}=${JSON.stringify(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}
