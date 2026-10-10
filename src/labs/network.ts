import type { Lab } from "./helpers.ts";

const ids = [1, 2, 3, 4, 5, 6, 7, 8];

export const lab: Lab = {
  id: "network",
  title: "Network: 8 API calls",
  emoji: "🌐",
  blurb: "Fetch 8 users from a slow API (250–700 ms each). Network time is pure waiting.",
  lesson:
    "I/O-bound work is where async shines: the CPU does nothing while the network works, " +
    "so 8 requests can be in flight at once. Total time drops from the SUM of latencies to the MAX.",
  variants: [
    {
      id: "blocking",
      name: "Blocking (sync HTTP)",
      kind: "blocking",
      summary: "One request at a time and the whole thread frozen during each.",
      run(ctx, env) {
        for (const id of ids)
          ctx.trackSync(`user${id}`, `GET /user/${id}`, () => {
            const r = env.syncFetch(`${env.mockUrl}/user/${id}`);
            if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          });
      },
    },
    {
      id: "await-loop",
      name: "Async, sequential await",
      kind: "async",
      summary: "Same wall-clock time, but the server stays responsive between requests.",
      async run(ctx, env) {
        for (const id of ids)
          await ctx.track(`user${id}`, `GET /user/${id}`, async () => {
            const r = await fetch(`${env.mockUrl}/user/${id}`);
            await r.json();
          });
      },
    },
    {
      id: "promise-all",
      name: "Async, Promise.all",
      kind: "async",
      summary: "All 8 requests in flight at once.",
      async run(ctx, env) {
        await Promise.all(
          ids.map((id) =>
            ctx.track(`user${id}`, `GET /user/${id}`, async () => {
              const r = await fetch(`${env.mockUrl}/user/${id}`);
              await r.json();
            }),
          ),
        );
      },
    },
  ],
};
