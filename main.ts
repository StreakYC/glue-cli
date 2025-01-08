import { Command } from "@cliffy/command";
import { logout } from "./commands/logout.ts";
import { deploy } from "./commands/deploy.ts";
import { dev } from "./commands/dev.ts";
import { login } from "./commands/login.ts";
import { whoami } from "./commands/whoami.ts";
import { version } from "./deno.json" with { type: "json" };

const cmd = new Command()
  .name("glue")
  .version(version)
  .description("Glue CLI utility")
  .action(() => {
    // Show help by default
    cmd.showHelp();
  })
  .command("dev", "Run a glue locally for development")
  .option("-n, --name <name:string>", "Set glue name")
  .option("--allow-stdin", "Allow stdin")
  .option("--keep-full-env", "Keep full environment")
  .arguments("<file:string>")
  .action(dev)
  .command("deploy", "Deploy a glue")
  .option("-n, --name <name:string>", "Glue name")
  .arguments("<file:string>")
  .action(deploy)
  .command("init", "Initialize a new glue")
  .action(() => {
    throw new Error(
      "Not implemented but eventually this will prompt the user for a filename or ask them what they are trying to build and autogen filename and code using AI",
    );
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
  .action(login)
  .command("logout", "Log out from Glue")
  .action(logout)
  .command("whoami", "Get the current user")
  .action(whoami);

await cmd.parse(Deno.args);
