import { blockingSleep, sleep, type Lab } from "./helpers.ts";

// Pure timers: the simplest way to see what `await` does (and does not) do.
const chores = [
  { id: "kettle", label: "☕ boil kettle", ms: 800 },
  { id: "toast", label: "🍞 make toast", ms: 600 },
  { id: "eggs", label: "🍳 fry eggs", ms: 700 },
  { id: "juice", label: "🧃 pour juice", ms: 200 },
];

export const lab: Lab = {
  id: "breakfast",
  title: "Breakfast: timers",
  emoji: "🍳",
  blurb: "Four chores that each just *wait*. Waiting is exactly what async is good at.",
  lesson:
    "`await` alone does NOT make things parallel: awaiting in a loop is as slow as blocking, " +
    "but it frees the thread. Start all the promises first, then await them together (Promise.all) to overlap the waiting.",
  variants: [
    {
      id: "blocking",
      name: "Blocking",
      kind: "blocking",
      summary: "Thread sleeps through every chore, one by one. Server is frozen the whole time.",
      run(ctx) {
        for (const c of chores) ctx.trackSync(c.id, c.label, () => blockingSleep(c.ms));
      },
    },
    {
      id: "await-loop",
      name: "Async, awaited one by one",
      kind: "async",
      summary: "Same total time as blocking, but the thread is free to serve others while waiting.",
      async run(ctx) {
        for (const c of chores) await ctx.track(c.id, c.label, () => sleep(c.ms));
      },
    },
    {
      id: "promise-all",
      name: "Async, Promise.all",
      kind: "async",
      summary: "All chores start together; total time = the slowest chore.",
      async run(ctx) {
        await Promise.all(chores.map((c) => ctx.track(c.id, c.label, () => sleep(c.ms))));
      },
    },
  ],
};
