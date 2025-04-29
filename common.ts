export const GLUE_API_SERVER = Deno.env.get("GLUE_API_SERVER") || `https://api.glue.wtf`;

export type Awaitable<T> = T | Promise<T>;
