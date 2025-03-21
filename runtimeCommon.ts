/**
 * This file has types shared between the runtime and the CLI.
 *
 * @module
 */
// TODO import this from runtime?

import { z } from "zod";

export const TriggerEvent = z.object({
  type: z.string(),
  label: z.string(),
  data: z.unknown(),
});
export type TriggerEvent = z.infer<typeof TriggerEvent>;

export interface RegisteredTrigger {
  label: string;
  type: string;
}

export type Awaitable<T> = T | Promise<T>;
