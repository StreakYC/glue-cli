import { load as dotEnvLoad } from "@std/dotenv";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { kv } from "../db.ts";
import { GLUE_API_SERVER } from "../common.ts";

interface DevOptions {
  name?: string;
  allowStdin?: true;
  keepFullEnv?: true;
}

export async function dev(options: DevOptions, file: string) {
  const glueName = options.name ?? basename(file);

  const { value: userEmail } = await kv.get<string>(["userEmail"]);
  if (!userEmail) {
    throw new Error("You are not logged in.");
  }

  const env: Record<string, string> = {
    GLUE_API_SERVER,
    GLUE_DEV: "true",
    GLUE_AUTHORIZATION_HEADER: "Basic " + encodeBase64(userEmail + ":"),
    GLUE_NAME: glueName,
  };

  if (!options.keepFullEnv) {
    const envKeysToKeep = ["LANG", "TZ", "TERM"];
    for (const envKeyToKeep of envKeysToKeep) {
      const value = Deno.env.get(envKeyToKeep);
      if (value) {
        env[envKeyToKeep] = value;
      }
    }
  }

  // include .env file
  const dotEnv = await dotEnvLoad();
  for (const [key, value] of Object.entries(dotEnv)) {
    env[key] = value;
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "--allow-env", "--allow-net", file],
    stdin: options.allowStdin ? "inherit" : "null",
    stdout: "inherit",
    clearEnv: !options.keepFullEnv,
    env,
  });

  const child = command.spawn();
  const status = await child.status;
  Deno.exit(status.code);
}
