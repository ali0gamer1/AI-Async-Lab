import type { Lab } from "./helpers.ts";
import { lab as breakfast } from "./breakfast.ts";
import { lab as network } from "./network.ts";
import { lab as files } from "./files.ts";
import { lab as cpu } from "./cpu.ts";
import { lab as pool } from "./pool.ts";
import { lab as timeout } from "./timeout.ts";
import { lab as errors } from "./errors.ts";
import { lab as streaming } from "./streaming.ts";

export const labs: Lab[] = [breakfast, network, files, cpu, pool, timeout, errors, streaming];
