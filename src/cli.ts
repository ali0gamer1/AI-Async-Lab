// Terminal version:  npm run cli [labId]   (no arg = all labs)
import { labs } from "./labs/index.ts";
import { createRunner } from "./runner.ts";

const runner = await createRunner();
const only = process.argv[2];
for (const lab of labs.filter((l) => !only || l.id === only)) {
  console.log(`\n${lab.emoji}  ${lab.title}\n   ${lab.lesson}`);
  for (const v of lab.variants) {
    const s = await runner.run(lab.id, v.id, () => {});
    const bar = "█".repeat(Math.max(1, Math.round(s.total / 100)));
    console.log(
      `  ${v.kind === "blocking" ? "🧱" : "⚡"} ${v.name.padEnd(36)} ${String(Math.round(s.total)).padStart(5)} ms  stall ${String(Math.round(s.maxStall)).padStart(5)} ms  ${bar}`,
    );
  }
}
runner.close();
process.exit(0);
