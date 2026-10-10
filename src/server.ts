import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import hljs from "highlight.js";
import { labs } from "./labs/index.ts";
import { createRunner } from "./runner.ts";
import type { LabInfo, StreamMessage } from "./types.ts";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "public");
const runner = await createRunner();

const md = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      return `<pre><code class="hljs language-${language}">${hljs.highlight(text, { language }).value}</code></pre>`;
    },
  },
});
const toMarkdownHtml = (code: string) => md.parse("```ts\n" + code.replace(/\n$/, "") + "\n```", { async: false });

const info: LabInfo[] = labs.map((l) => ({
  id: l.id,
  title: l.title,
  emoji: l.emoji,
  blurb: l.blurb,
  lesson: l.lesson,
  variants: l.variants.map(({ id, name, kind, summary }) => ({ id, name, kind, summary })),
  sourceHtml: toMarkdownHtml(fs.readFileSync(path.join(import.meta.dirname, "labs", `${l.id}.ts`), "utf8")),
}));

const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");

  if (url.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return void res.end("{}");
  }
  if (url.pathname === "/api/labs") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify(info));
  }
  if (url.pathname === "/api/run") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const send = (m: StreamMessage) => res.write(`data: ${JSON.stringify(m)}\n\n`);
    try {
      const summary = await runner.run(url.searchParams.get("lab") ?? "", url.searchParams.get("variant") ?? "", (event) =>
        send({ type: "event", event }),
      );
      send({ type: "done", summary });
    } catch (e) {
      send({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
    return void res.end();
  }

  if (url.pathname === "/hljs.css") {
    res.writeHead(200, { "content-type": "text/css" });
    return void res.end(fs.readFileSync(path.join(root, "node_modules/highlight.js/styles/github-dark.css")));
  }

  const file = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return void res.end("not found");
  }
  res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Async lab running on http://localhost:${port}`));
process.on("SIGINT", () => {
  runner.close();
  process.exit(0);
});
