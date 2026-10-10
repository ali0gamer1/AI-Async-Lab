import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Lab } from "./helpers.ts";

const FILES = 12;
const SIZE = 32 * 1024 * 1024;

const nameOf = (dir: string, i: number, tag: string) => path.join(dir, `${tag}-${i}.bin`);

export const lab: Lab = {
  id: "files",
  title: "File I/O: write, sync to disk, hash",
  emoji: "💾",
  blurb: `Write ${FILES} files of 32 MB (forcing fsync so the disk really works), then read & SHA-256 each one.`,
  lesson:
    "Node's fs/promises hands work to a thread pool, so the main thread stays free and disk waits overlap. " +
    "Gains depend on your disk: the point is the main thread is never stalled (check the stall figure).",
  variants: [
    {
      id: "blocking",
      name: "Blocking (fs.*Sync)",
      kind: "blocking",
      summary: "Every write, fsync and read freezes the event loop.",
      run(ctx, env) {
        const buf = Buffer.alloc(SIZE, 7);
        for (let i = 0; i < FILES; i++)
          ctx.trackSync(`f${i}`, `file ${i}`, () => {
            const p = nameOf(env.tmpDir, i, "sync");
            const fd = fs.openSync(p, "w");
            fs.writeSync(fd, buf);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            createHash("sha256").update(fs.readFileSync(p)).digest("hex");
          });
      },
    },
    {
      id: "await-loop",
      name: "Async, sequential await",
      kind: "async",
      summary: "Non-blocking calls, but one file after another.",
      async run(ctx, env) {
        const buf = Buffer.alloc(SIZE, 7);
        for (let i = 0; i < FILES; i++)
          await ctx.track(`f${i}`, `file ${i}`, async () => {
            const p = nameOf(env.tmpDir, i, "seq");
            const h = await fsp.open(p, "w");
            await h.write(buf);
            await h.sync();
            await h.close();
            createHash("sha256").update(await fsp.readFile(p)).digest("hex");
          });
      },
    },
    {
      id: "promise-all",
      name: "Async, Promise.all",
      kind: "async",
      summary: "All files processed concurrently via libuv's thread pool.",
      async run(ctx, env) {
        const buf = Buffer.alloc(SIZE, 7);
        await Promise.all(
          Array.from({ length: FILES }, (_, i) =>
            ctx.track(`f${i}`, `file ${i}`, async () => {
              const p = nameOf(env.tmpDir, i, "par");
              const h = await fsp.open(p, "w");
              await h.write(buf);
              await h.sync();
              await h.close();
              createHash("sha256").update(await fsp.readFile(p)).digest("hex");
            }),
          ),
        );
      },
    },
  ],
};
