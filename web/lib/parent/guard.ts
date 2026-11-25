/** Ignore repeated taps while the first one is still running (older users often double-tap). */
export function singleFlight<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let running: Promise<void> | null = null;
  return (...args: A) => {
    if (running) return running;
    running = fn(...args).finally(() => { running = null; });
    return running;
  };
}
