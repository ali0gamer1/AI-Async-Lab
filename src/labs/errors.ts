import { errMsg, sleep, type Ctx, type Env, type Lab } from "./helpers.ts";

// 3 healthy endpoints, 1 that's down for good, 1 flaky (fails twice then works).
const endpoints = (env: Env) => [
  { id: "a", url: `${env.mockUrl}/delay/300` },
  { id: "b", url: `${env.mockUrl}/delay/500` },
  { id: "dead", url: `${env.mockUrl}/status/500` },
  { id: "flaky", url: `${env.mockUrl}/flaky/${env.runId}/2` },
  { id: "c", url: `${env.mockUrl}/delay/900` },
];

const get = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
};

async function withRetry(ctx: Ctx, id: string, url: string, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await get(url);
    } catch (e) {
      if (attempt >= tries) throw e;
      const wait = 100 * 2 ** attempt;
      ctx.log(`${id}: ${errMsg(e)}, retry ${attempt} in ${wait} ms`);
      await sleep(wait);
    }
  }
}

export const lab: Lab = {
  id: "errors",
  title: "Error handling",
  emoji: "💥",
  blurb: "5 requests: one endpoint is dead, one is flaky (fails twice, then works).",
  lesson:
    "Promise.all rejects on the FIRST failure and you lose the other results (the work still runs). " +
    "allSettled collects everything; retry with backoff recovers from transient errors.",
  variants: [
    {
      id: "blocking",
      name: "Blocking try/catch",
      kind: "blocking",
      summary: "Sequential; one failure is handled inline.",
      run(ctx, env) {
        for (const e of endpoints(env))
          try {
            ctx.trackSync(e.id, e.id, () => {
              const r = env.syncFetch(e.url);
              if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
            });
          } catch {
            /* already recorded as a failed task */
          }
      },
    },
    {
      id: "all",
      name: "Async, Promise.all",
      kind: "async",
      summary: "Fails fast on the dead endpoint; everyone else's result is discarded.",
      async run(ctx, env) {
        try {
          await Promise.all(endpoints(env).map((e) => ctx.track(e.id, e.id, () => get(e.url))));
        } catch (e) {
          ctx.log(`Promise.all rejected with: ${errMsg(e)}. Results of the rest: lost.`);
          await sleep(1000); // let the stragglers finish so you can see they kept running
        }
      },
    },
    {
      id: "settled",
      name: "Async, allSettled + retry",
      kind: "async",
      summary: "Every call gets its own retries; nothing is lost, only the dead one ends failed.",
      async run(ctx, env) {
        const r = await Promise.allSettled(endpoints(env).map((e) => ctx.track(e.id, e.id, () => withRetry(ctx, e.id, e.url))));
        ctx.log(`${r.filter((x) => x.status === "fulfilled").length}/${r.length} succeeded`);
      },
    },
  ],
};
