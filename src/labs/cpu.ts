import os from "node:os";
import { Worker } from "node:worker_threads";
import type { Lab } from "./helpers.ts";

const LIMIT = 4_000_000;
const CHUNKS = 8;

export function countPrimes(lo: number, hi: number): number {
  let count = 0;
  for (let n = Math.max(lo, 2); n < hi; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        prime = false;
        break;
      }
    }
    if (prime) count++;
  }
  return count;
}

const ranges = Array.from({ length: CHUNKS }, (_, i) => [(i * LIMIT) / CHUNKS, ((i + 1) * LIMIT) / CHUNKS] as const);
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

export const lab: Lab = {
  id: "cpu",
  title: "CPU-bound: counting primes",
  emoji: "🔥",
  blurb: `Count primes below ${LIMIT.toLocaleString()} in ${CHUNKS} chunks. No waiting here: the CPU is the bottleneck.`,
  lesson:
    "async/await does NOT speed up CPU work. Slicing it with setImmediate keeps the server responsive (but not faster). " +
    "To actually go faster you need more threads: worker_threads.",
  variants: [
    {
      id: "blocking",
      name: "Blocking loop",
      kind: "blocking",
      summary: "Hogs the event loop: nothing else (ping, timers, requests) runs.",
      run(ctx) {
        for (const [i, [lo, hi]] of ranges.entries()) ctx.trackSync(`c${i}`, `chunk ${i}`, () => countPrimes(lo, hi));
      },
    },
    {
      id: "chunked",
      name: "Async, yielding between slices",
      kind: "async",
      summary: "Same CPU work in 20k-number slices, yielding to the event loop in between. Responsive, not faster.",
      async run(ctx) {
        for (const [i, [lo, hi]] of ranges.entries()) {
          ctx.start(`c${i}`, `chunk ${i}`);
          for (let s = lo; s < hi; s += 20_000) {
            countPrimes(s, Math.min(s + 20_000, hi));
            await yieldToLoop();
          }
          ctx.end(`c${i}`);
        }
      },
    },
    {
      id: "workers",
      name: "worker_threads",
      kind: "async",
      summary: "Chunks run on separate CPU cores. Responsive AND faster.",
      async run(ctx) {
        const cores = os.availableParallelism();
        ctx.log(`${cores} cores available`);
        await Promise.all(
          ranges.map(([lo, hi], i) =>
            ctx.track(`c${i}`, `chunk ${i}`, () => {
              const w = new Worker(new URL("../cpuWorker.ts", import.meta.url), { workerData: { lo, hi } });
              return new Promise<number>((res, rej) => {
                w.once("message", res);
                w.once("error", rej);
              });
            }),
          ),
        );
      },
    },
  ],
};
