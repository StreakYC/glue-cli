export const kv = await Deno.openKv(`${Deno.env.get("HOME")}/.glue/cli.sqlite3`);
