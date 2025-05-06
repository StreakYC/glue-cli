const home = Deno.env.get("HOME");
if (home) {
  const dir = `${home}/.glue`;
  await Deno.mkdir(dir, { recursive: true });
}

export const kv = await Deno.openKv(`${home}/.glue/cli.sqlite3`);
