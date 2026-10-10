# ⚡ Async Lab (TypeScript)

Blocking vs. async, side by side, with the effects made visible.

```bash
npm install
npm start        # builds the client, serves http://localhost:3000  (PORT=... to change)
npm run cli      # same experiments in the terminal (npm run cli network)
npm run typecheck
```
Requires Node 22.18+ (runs `.ts` directly).

Every lab runs on the server's **single main thread**, in several variants. While it runs, the page
pings that thread every 100 ms, and the server measures its own event-loop stalls. A blocking
variant freezes the pings and can't even report progress until it ends; async variants stay responsive.

| Lab | Idea |
|---|---|
| 🍳 Breakfast | timers: blocking vs `await` in a loop vs `Promise.all` |
| 🌐 Network | 8 slow API calls, sync HTTP vs sequential vs concurrent |
| 💾 File I/O | `fs.*Sync` vs `fs/promises` (with fsync) |
| 🔥 CPU-bound | async doesn't speed up CPU: slicing with `setImmediate` vs `worker_threads` |
| 🚦 Concurrency limits | unbounded `Promise.all` vs a pool, against a rate-limited API |
| ⏱️ Timeouts | `Promise.race` (leaks) vs `AbortSignal` (cancels) |
| 💥 Errors | `Promise.all` vs `allSettled` + retry with backoff |
| 🌊 Streaming | `await text()` vs `for await` async-generator pipeline |

Each lab is one file in `src/labs/`; the UI shows its source. Add a lab by creating a file there and
registering it in `src/labs/index.ts`. `src/mockApi.ts` is the slow/flaky API (own thread),
`src/syncFetch.ts` implements the truly blocking HTTP call (`Atomics.wait`).
