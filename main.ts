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
  .command("run", "Run code locally for development") // "dev" instead?
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
  .command("deploy", "Deploy code")
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
  .command(
    "versions",
    "List, view, upload and deploy versions of your Glue code",
  )
  .action(() => {
    throw new Error("Not implemented");
  })
  .command("login", "Log in to Glue")
  .action(() => {
    throw new Error("Not implemented");
  })
  .command("logout", "Log out from Glue")
  .action(() => {
    throw new Error("Not implemented");
  })
  .command("whoami", "Get the current user")
  .action(() => {
    throw new Error("Not implemented");
  });
await cmd.parse(Deno.args);
