export const GLUE_API_SERVER = Deno.env.get("GLUE_API_SERVER") || `https://api.glue.wtf`;

export type Awaitable<T> = T | Promise<T>;

export function isPrefixId(query: string, prefix: string) {
  // prefix ids are like d_34f4000000000000 or g_1800000000000000 or d_e18000000000000
  // use a regex to check if the query starts with the prefix, then underscore then followed by any number of hex digits
  const regex = new RegExp(`^${prefix}_[0-9a-f]{1,}$`);
  return regex.test(query);
}
