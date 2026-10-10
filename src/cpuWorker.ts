import { parentPort, workerData } from "node:worker_threads";
import { countPrimes } from "./labs/cpu.ts";

const { lo, hi } = workerData as { lo: number; hi: number };
parentPort!.postMessage(countPrimes(lo, hi));
