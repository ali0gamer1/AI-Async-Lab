// A deliberately slow, deliberately flaky API. Runs in its own worker thread
// so it keeps answering even while the main thread is blocked.
import http from "node:http";
import { parentPort } from "node:worker_threads";

const flakyCounts = new Map<string, number>();
let inflightLimited = 0;
let aborted = 0;
const LIMIT = 4;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const parts = url.pathname.split("/").filter(Boolean);
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    res.on("close", () => clearTimeout(t));
  };

  switch (parts[0]) {
    case "delay": // /delay/:ms
      return later(Number(parts[1]), () => json(200, { delay: Number(parts[1]) }));

    case "user": { // /user/:id  -> 250..700ms depending on id
      const id = Number(parts[1]);
      return later(250 + ((id * 137) % 450), () => json(200, { id, name: `user-${id}` }));
    }

    case "limited": { // /limited/:ms  -> only LIMIT requests in flight, others get 429
      if (inflightLimited >= LIMIT) return json(429, { error: "too many concurrent requests" });
      inflightLimited++;
      res.on("close", () => inflightLimited--);
      return later(Number(parts[1]), () => json(200, { ok: true }));
    }

    case "flaky": { // /flaky/:key/:failTimes -> 503 for the first N attempts
      const key = parts[1];
      const n = (flakyCounts.get(key) ?? 0) + 1;
      flakyCounts.set(key, n);
      return later(150, () => (n <= Number(parts[2]) ? json(503, { error: `attempt ${n} failed` }) : json(200, { ok: true, attempt: n })));
    }

    case "status": // /status/:code
      return later(100, () => json(Number(parts[1]), { code: Number(parts[1]) }));

    case "hang": // never answers; counts how many clients gave up
      req.on("close", () => aborted++);
      res.on("close", () => {});
      return;

    case "stats":
      return json(200, { aborted });

    case "stream": { // /stream/:n -> n NDJSON lines, one every 250ms
      const n = Number(parts[1]);
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      let i = 0;
      const timer = setInterval(() => {
        res.write(JSON.stringify({ item: ++i }) + "\n");
        if (i >= n) {
          clearInterval(timer);
          res.end();
        }
      }, 250);
      res.on("close", () => clearInterval(timer));
      return;
    }

    default:
      json(404, { error: "not found" });
  }
});

server.listen(0, "127.0.0.1", () => {
  parentPort?.postMessage({ port: (server.address() as { port: number }).port });
});
