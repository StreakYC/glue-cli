import { kv } from "./db.ts";
import { Input } from "@cliffy/prompt";
import { Command } from "@cliffy/command";
import { load as dotEnvLoad } from "@std/dotenv";
import { basename } from "@std/path/basename";

const GLUE_API_SERVER = Deno.env.get("GLUE_API_SERVER") ||
  "https://glue-test-71.deno.dev";

const cmd = new Command()
  .name("glue")
  // .version("0.1.0") // TODO use version from deno.json
  .description("Glue CLI utility")
  .action(() => {
    // Show help by default
    cmd.showHelp();
  })
  .command("dev", "Run a glue locally for development")
  .option("-n, --name <name:string>", "Set glue name")
  .option("--allow-stdin", "Allow stdin")
  .option("--keep-full-env", "Keep full environment")
  // TODO debugging options
  .arguments("<file:string>")
  .action(async (options, file) => {
    const glueName = options.name ?? basename(file);

    const env: Record<string, string> = {
      GLUE_API_SERVER,
      GLUE_DEV: "true",
      GLUE_AUTHORIZATION_HEADER: "Bearer 123",
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
  })
  .command("deploy", "Deploy a glue") // --name flag
  .option("-n, --name <name:string>", "Glue name") // defaults based on file name
  .arguments("<file:string>")
  .action(async (options, file) => {
    const glueName = options.name ?? basename(file);
    const body = {
      name: glueName,
      entryPointUrl: basename(file),
      assets: {
        [basename(file)]: await Deno.readTextFile(file),
      },
    };
    const res = await fetch(`${GLUE_API_SERVER}/glues/deploy`, {
      // TODO auth headers
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(await res.text());
  })
  .command("init", "Initialize a new glue")
  .action(() => {
    // prompt user for name. TODO instead of prompting for name, prompt
    // "describe what you're building" and use AI to generate the glue script.
    throw new Error("Not implemented");
  })
  .command("list", "List your glues")
  .action(() => {
    throw new Error("Not implemented");
  })
  .command("delete", "Delete a glue")
  .arguments("<name:string>")
  .action(() => {
    throw new Error("Not implemented");
  })
  .command(
    "versions",
    "List, view, upload and deploy versions of your Glue code",
  )
  .action(() => {
    throw new Error("Not implemented");
  })
  .command("login", "Log in to Glue")
  .action(async () => {
    // TODO actual auth
    const email: string = await Input.prompt(`What's your email address?`);
    await kv.set(["userEmail"], email);
    console.log(`Logged in as ${JSON.stringify(email)}`);
  })
  .command("logout", "Log out from Glue")
  .action(async () => {
    await kv.delete(["userEmail"]);
    console.log("Logged out");
  })
  .command("whoami", "Get the current user")
  .action(async () => {
    const { value: userEmail } = await kv.get<string>(["userEmail"]);
    if (!userEmail) {
      console.log("You are not logged in.");
    } else {
      console.log(`Logged in as ${JSON.stringify(userEmail)}`);
    }
  });

await cmd.parse(Deno.args);
