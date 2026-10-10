import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { labs } from "./labs/index.ts";
import { makeCtx, errMsg, type Env } from "./labs/helpers.ts";
import { createSyncFetch } from "./syncFetch.ts";
import type { LabEvent, RunSummary } from "./types.ts";

export async function createRunner() {
  const mock = new Worker(new URL("./mockApi.ts", import.meta.url));
  const port = await new Promise<number>((res, rej) => {
    mock.once("message", (m: { port: number }) => res(m.port));
    mock.once("error", rej);
  });
  mock.unref();
  const { syncFetch } = createSyncFetch();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asyncol-"));
  const mockUrl = `http://127.0.0.1:${port}`;
  let busy = false;

  // Warm up so the first run doesn't pay one-off costs (DNS-free, but connection setup, JIT, worker start).
  await fetch(`${mockUrl}/delay/1`);
  syncFetch(`${mockUrl}/delay/1`);

  async function run(labId: string, variantId: string, onEvent: (e: LabEvent) => void): Promise<RunSummary> {
    const lab = labs.find((l) => l.id === labId);
    const variant = lab?.variants.find((v) => v.id === variantId);
    if (!lab || !variant) throw new Error("unknown lab/variant");
    if (busy) throw new Error("another run is in progress");
    busy = true;

    const env: Env = { mockUrl, tmpDir, syncFetch, runId: `${Date.now()}${Math.random()}` };
    const t0 = performance.now();
    const ctx = makeCtx((e) => onEvent({ ...e, t: performance.now() - t0 }));

    // Event-loop heartbeat: a 10 ms timer. If the loop is blocked, the timer fires late.
    const BEAT = 10;
    let ticks = 0;
    let maxStall = 0;
    let last = performance.now();
    const hb = setInterval(() => {
      const now = performance.now();
      maxStall = Math.max(maxStall, now - last - BEAT);
      last = now;
      ticks++;
    }, BEAT);

    try {
      await variant.run(ctx, env);
    } catch (e) {
      ctx.log(`run aborted: ${errMsg(e)}`);
    } finally {
      clearInterval(hb);
      busy = false;
    }
    const total = performance.now() - t0;
    // A blocked loop never gets to fire the last timers; count the stall at the tail too.
    maxStall = Math.max(maxStall, performance.now() - last - BEAT);
    return { total, maxStall: Math.max(0, maxStall), ticks, expectedTicks: Math.floor(total / BEAT) };
  }

  return { run, mockUrl, close: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}
