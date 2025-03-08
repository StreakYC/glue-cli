import { Command, EnumType } from "@cliffy/command";
import { deploy } from "./commands/deploy.ts";
import { dev } from "./commands/dev.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { whoami } from "./commands/whoami.ts";
import { list } from "./commands/list.ts";
import { deployments } from "./commands/deployments.ts";
import { describe } from "./commands/describe.ts";
import denoJson from "./deno.json" with { type: "json" };
import { tail } from "./commands/tail.ts";
const cmd = new Command()
  .name("glue")
  .version(denoJson.version)
  .description("Glue CLI utility")
  .globalType("formatType", new EnumType(["table", "json"]))
  .action(() => {
    cmd.showHelp();
  })
  // DEV ----------------------------
  .command("dev", "Run a glue locally for development")
  .option("-n, --name <name:string>", "Set glue name")
  .option("--allow-stdin", "Allow stdin")
  .option("--keep-full-env", "Keep full environment")
  .arguments("<file:string>")
  .action(dev)
  // DEPLOY ----------------------------
  .command("deploy", "Deploy a glue")
  .option("-n, --name <name:string>", "Glue name")
  .arguments("<file:string>")
  .action(deploy)
  // CREATE ----------------------------
  .command("create", "Create a new glue from a template")
  .action(() => {
    throw new Error(
      "Not implemented but eventually this will prompt the user for a filename or ask them what they are trying to build and autogen filename and code using AI",
    );
  })
  // LIST ----------------------------
  .command("list", "List all of your deployed glues")
  .option("-nf, --name-filter <nameFilter:string>", "Filter glues by name")
  .option("-f, --format <format:formatType>", "Output format")
  .action(list)
  // PAUSE ----------------------------
  .command("pause", "Pause a deployed glue")
  .arguments("<name:string>")
  .action(() => {
    throw new Error("Not implemented");
  })
  // RESUME ----------------------------
  .command("resume", "Resume a paused glue")
  .arguments("<name:string>")
  .action(() => {
    throw new Error("Not implemented");
  })
  // DEPLOYMENTS ----------------------------
  .command(
    "deployments",
    "List all the deployments of a Glue",
  )
  .arguments("[name:string]")
  .option("-f, --format <format:formatType>", "Output format")
  .action(deployments)
  // DESCRIBE ----------------------------
  .command("describe", "Describe a glue or any other resource. Query can be a glue name or any id for any resource")
  .arguments("[query:string]")
  .option("-f, --format <format:formatType>", "Output format")
  .action(describe)
  // TAIL ----------------------------
  .command("tail", "View a live stream of the executions of a glue. Provide a glue name or id.")
  .arguments("[name:string]")
  .option("-f, --format <format:formatType>", "Output format, if JSON, will use JSONL format", { default: "table" })
  .option("-n, --number <number:number>", "Number of historical executions to print initially", { default: 10 })
  .option("-N, --no-follow", "Don't follow the executions, just print the latest")
  .option("-l --log-lines <logLines:number>", "Number of log lines to print for each execution. Set to 0 to hide log lines", { default: 10 })
  .action(tail)
  // LOGIN ----------------------------
  .command("login", "Log in to Glue")
  .action(login)
  // LOGOUT ----------------------------
  .command("logout", "Log out from Glue")
  .action(logout)
  // WHOAMI ----------------------------
  .command("whoami", "Get the current user")
  .action(whoami);

await cmd.parse(Deno.args);
