import type { Lab } from "./helpers.ts";

const N = 8;

async function* lines(res: Response): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, i);
      buf = buf.slice(i + 1);
    }
  }
}

async function* map<T, U>(src: AsyncIterable<T>, f: (x: T) => U): AsyncGenerator<U> {
  for await (const x of src) yield f(x);
}

export const lab: Lab = {
  id: "streaming",
  title: "Streaming with async generators",
  emoji: "🌊",
  blurb: `A server emits ${N} records, one every 250 ms (2 s total). When can we start using them?`,
  lesson:
    "`for await` + async generators process data as it ARRIVES, so first results show up after 250 ms, " +
    "not after the whole response. Pipelines compose lazily, with backpressure for free.",
  variants: [
    {
      id: "blocking",
      name: "Blocking (wait for everything)",
      kind: "blocking",
      summary: "Nothing is usable until the entire body has arrived.",
      run(ctx, env) {
        ctx.start("all", "download whole body");
        const r = env.syncFetch(`${env.mockUrl}/stream/${N}`);
        ctx.end("all");
        r.body.trim().split("\n").forEach((l, i) => {
          ctx.start(`item${i + 1}`, `process item ${i + 1}`);
          ctx.end(`item${i + 1}`, l);
        });
      },
    },
    {
      id: "buffered",
      name: "Async, await res.text()",
      kind: "async",
      summary: "Non-blocking, but still waits for the whole body before processing anything.",
      async run(ctx, env) {
        ctx.start("all", "download whole body");
        const text = await (await fetch(`${env.mockUrl}/stream/${N}`)).text();
        ctx.end("all");
        text.trim().split("\n").forEach((l, i) => {
          ctx.start(`item${i + 1}`, `process item ${i + 1}`);
          ctx.end(`item${i + 1}`, l);
        });
      },
    },
    {
      id: "generator",
      name: "Async generator pipeline",
      kind: "async",
      summary: "Each record is processed the moment it arrives.",
      async run(ctx, env) {
        const res = await fetch(`${env.mockUrl}/stream/${N}`);
        const items = map(lines(res), (l) => (JSON.parse(l) as { item: number }).item);
        for await (const item of items) {
          ctx.start(`item${item}`, `process item ${item}`);
          ctx.end(`item${item}`, "processed on arrival");
        }
      },
    },
  ],
};
