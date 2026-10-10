import { errMsg, sleep, type Lab } from "./helpers.ts";

const TIMEOUT = 1000;

async function hangsServed(url: string): Promise<number> {
  return ((await (await fetch(`${url}/stats`)).json()) as { aborted: number }).aborted;
}

export const lab: Lab = {
  id: "timeout",
  title: "Timeouts & cancellation",
  emoji: "⏱️",
  blurb: `The server never answers. We are only willing to wait ${TIMEOUT} ms.`,
  lesson:
    "Promise.race only stops WAITING; the request keeps running in the background (a leak). " +
    "AbortSignal actually cancels the work: the server sees the connection close.",
  variants: [
    {
      id: "blocking",
      name: "Blocking (no timeout possible)",
      kind: "blocking",
      summary: "A blocking call can't be interrupted. (Capped at 4 s here so the lab ends.)",
      run(ctx, env) {
        ctx.trackSync("req", "GET /delay/4000", () => env.syncFetch(`${env.mockUrl}/delay/4000`));
        ctx.log("Wanted to give up after 1 s... but couldn't: we were frozen.");
      },
    },
    {
      id: "race",
      name: "Async, Promise.race",
      kind: "async",
      summary: "Gives up after 1 s, but the request is still alive.",
      async run(ctx, env) {
        const before = await hangsServed(env.mockUrl);
        await ctx
          .track("req", "GET /hang (race)", () =>
            Promise.race([
              fetch(`${env.mockUrl}/hang`),
              sleep(TIMEOUT).then(() => Promise.reject(new Error("timed out"))),
            ]),
          )
          .catch((e) => ctx.log(errMsg(e)));
        await sleep(200);
        ctx.log(`requests cancelled on server: ${(await hangsServed(env.mockUrl)) - before} (request leaked!)`);
      },
    },
    {
      id: "abort",
      name: "Async, AbortSignal.timeout",
      kind: "async",
      summary: "Gives up after 1 s AND cancels the request.",
      async run(ctx, env) {
        const before = await hangsServed(env.mockUrl);
        await ctx
          .track("req", "GET /hang (abort)", () => fetch(`${env.mockUrl}/hang`, { signal: AbortSignal.timeout(TIMEOUT) }))
          .catch((e) => ctx.log(errMsg(e)));
        await sleep(200);
        ctx.log(`requests cancelled on server: ${(await hangsServed(env.mockUrl)) - before} (clean)`);
      },
    },
  ],
};
