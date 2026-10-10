import type { LabEvent } from "../types.ts";

export interface Ctx {
  start(task: string, label?: string, lane?: number): void;
  end(task: string, note?: string): void;
  fail(task: string, note?: string): void;
  log(msg: string): void;
  /** Wrap an async function in start/end(fail) events. */
  track<T>(task: string, label: string, fn: () => Promise<T>, lane?: number): Promise<T>;
  /** Wrap a synchronous function in start/end(fail) events. */
  trackSync<T>(task: string, label: string, fn: () => T): T;
}

export interface Env {
  /** Base URL of the slow mock API (lives on its own thread, so it keeps answering while we block). */
  mockUrl: string;
  tmpDir: string;
  /** Genuinely blocking HTTP GET: freezes this thread until the response is in. */
  syncFetch(url: string): { status: number; body: string };
  runId: string;
}

export interface Variant {
  id: string;
  name: string;
  kind: "blocking" | "async";
  summary: string;
  run(ctx: Ctx, env: Env): Promise<void> | void;
}

export interface Lab {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  lesson: string;
  variants: Variant[];
}

export function makeCtx(emit: (e: Omit<LabEvent, "t">) => void): Ctx {
  const ctx: Ctx = {
    start: (task, label, lane) => emit({ kind: "start", task, label: label ?? task, lane }),
    end: (task, note) => emit({ kind: "end", task, msg: note }),
    fail: (task, note) => emit({ kind: "fail", task, msg: note }),
    log: (msg) => emit({ kind: "log", msg }),
    async track(task, label, fn, lane) {
      ctx.start(task, label, lane);
      try {
        const r = await fn();
        ctx.end(task);
        return r;
      } catch (e) {
        ctx.fail(task, errMsg(e));
        throw e;
      }
    },
    trackSync(task, label, fn) {
      ctx.start(task, label);
      try {
        const r = fn();
        ctx.end(task);
        return r;
      } catch (e) {
        ctx.fail(task, errMsg(e));
        throw e;
      }
    },
  };
  return ctx;
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Async sleep: hands the thread back to the event loop while waiting. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Blocking sleep: the whole thread stands still. Nothing else can run. */
export function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run `fn` over `items`, never more than `limit` at the same time. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number, worker: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async (w: number) => {
    
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i, w);
    }
  };

  console.log(`Starting pool with limit ${limit} and ${items.length} items`);
  
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, w) => run(w)));
  return results;
}
