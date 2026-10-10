import { pool, type Lab, type Ctx, type Env } from "./helpers.ts";


async function fakeRequest(n: number) {
  const delay = 500 + Math.random() * 500;

  await new Promise(resolve => setTimeout(resolve, delay));

  console.log(`Job ${n} finished after ${Math.round(delay)}ms`);
  return n;
}


const JOBS = Array.from({ length: 30 }, (_, i) => i + 1);

// The API only tolerates 4 concurrent requests and answers 429 beyond that.
async function call(ctx: Ctx, env: Env, n: number, worker?: number) {
  const label = worker === undefined ? `job ${n}` : `job ${n} · worker ${worker + 1}`;
  await ctx.track(`job${n}`, label, async () => {
    //only delay if using pool

    if (worker !== undefined) {
      let delay = 500 + Math.random() * 500;
      if (worker == 1)
      {
        delay += 5000; // additional delay for worker 1 for no reason haha.
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    //
    const r = await fetch(`${env.mockUrl}/limited/400`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  }, worker);
}

export const lab: Lab = {
  id: "pool",
  title: "Concurrency limits",
  emoji: "🚦",
  blurb: "12 jobs against an API that only allows 4 concurrent requests (extra ones get HTTP 429).",
  lesson:
    "More concurrency isn't always better. Unbounded Promise.all overwhelms the other side; " +
    "a small pool keeps ~4 in flight, finishing nearly as fast without a single rejection.",
  variants: [
    {
      id: "sequential",
      name: "Async, one at a time",
      kind: "async",
      summary: "Safe but slow: 12 × 400 ms.",
      async run(ctx, env) {
        for (const n of JOBS) await call(ctx, env, n);
      },
    },
    {
      id: "unbounded",
      name: "Async, unbounded Promise.allSettled",
      kind: "async",
      summary: "Fires all 12 at once. The API rejects most of them.",
      async run(ctx, env) {
        const r = await Promise.allSettled(JOBS.map((n) => call(ctx, env, n)));
        ctx.log(`${r.filter((x) => x.status === "rejected").length}/${JOBS.length} rejected`);
      },
    },
    {
      id: "pool",
      name: "Async, pool of 4",
      kind: "async",
      summary: "Never more than 4 in flight: all succeed, ~3x faster than sequential.",
      async run(ctx, env) {
        await pool(JOBS, 4, (n, _i, worker) => call(ctx, env, n, worker));
      },
    },
  ],
};
