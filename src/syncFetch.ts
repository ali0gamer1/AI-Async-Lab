// Lets the main thread perform a *blocking* HTTP GET.
// A helper thread does the real fetch; the main thread sleeps on Atomics.wait until it is done.
import { Worker, MessageChannel, receiveMessageOnPort, parentPort, workerData, isMainThread } from "node:worker_threads";

export interface SyncResult {
  status: number;
  body: string;
}

if (!isMainThread) {
  const { port, flag } = workerData as { port: MessagePort; flag: SharedArrayBuffer };
  const view = new Int32Array(flag);
  parentPort!.on("message", async (url: string) => {
    let result: SyncResult;
    try {
      const r = await fetch(url);
      result = { status: r.status, body: await r.text() };
    } catch (e) {
      result = { status: 0, body: String(e) };
    }
    (port as unknown as { postMessage(v: unknown): void }).postMessage(result);
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0);
  });
}

export function createSyncFetch(): { syncFetch(url: string): SyncResult; close(): void } {
  const { port1, port2 } = new MessageChannel();
  const flag = new SharedArrayBuffer(4);
  const view = new Int32Array(flag);
  const worker = new Worker(new URL(import.meta.url), { workerData: { port: port2, flag }, transferList: [port2] });
  worker.unref();
  return {
    syncFetch(url) {
      Atomics.store(view, 0, 0);
      worker.postMessage(url);
      Atomics.wait(view, 0, 0); // <-- the main thread is frozen here
      return (receiveMessageOnPort(port1)?.message ?? { status: 0, body: "no result" }) as SyncResult;
    },
    close: () => void worker.terminate(),
  };
}
