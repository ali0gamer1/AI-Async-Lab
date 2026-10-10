export type EventKind = "start" | "end" | "fail" | "log";

/** One thing that happened during a run. `t` = ms since the run began. */
export interface LabEvent {
  t: number;
  kind: EventKind;
  task?: string;
  label?: string;
  /** Optional worker/lane number that handled the task (shown in the UI). */
  lane?: number;
  msg?: string;
}

export interface RunSummary {
  total: number;
  /** Longest time the server's event loop was unable to do anything else. */
  maxStall: number;
  /** Timer ticks that fired during the run vs. how many an idle loop would manage. */
  ticks: number;
  expectedTicks: number;
}

export type StreamMessage =
  | { type: "event"; event: LabEvent }
  | { type: "done"; summary: RunSummary }
  | { type: "error"; message: string };

export interface VariantInfo {
  id: string;
  name: string;
  kind: "blocking" | "async";
  summary: string;
}

export interface LabInfo {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  lesson: string;
  variants: VariantInfo[];
  /** Source code as markdown rendered to syntax-highlighted HTML. */
  sourceHtml: string;
}
