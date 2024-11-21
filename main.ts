import { kv } from "./db.ts";
import { Input } from "@cliffy/prompt";
import { Command } from "@cliffy/command";

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
  // .option("-n, --name <name:string>", "Set glue name") // is this needed for dev?
  .arguments("<file:string>")
  .action(async (_options, ..._args) => {
    const command = new Deno.Command(Deno.execPath(), {
      args: ["eval", "console.log('Hello World')"],
      stdin: "inherit",
      stdout: "inherit",
    });
    const child = command.spawn();
    const status = await child.status;
    Deno.exit(status.code);
  })
  .command("deploy", "Deploy a glue") // --name flag
  .option("-n, --name <name:string>", "Glue name") // defaults based on file name
  .arguments("<file:string>")
  .action(async (_options, file) => {
    const code = await Deno.readTextFile(file);
    const res = await fetch(`${GLUE_API_SERVER}/deploy`, {
      // TODO auth headers
      method: "POST",
      body: JSON.stringify({ code }),
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
