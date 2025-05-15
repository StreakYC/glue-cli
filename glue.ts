import { Command } from "@cliffy/command";
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
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import { UpgradeCommand } from "@cliffy/command/upgrade";
import { pause } from "./commands/pause.ts";
import { resume } from "./commands/resume.ts";
import { share } from "./commands/share.ts";
import { accounts, deleteAccountCmd } from "./commands/accounts.ts";
import { create } from "./commands/create.ts";
import { replay } from "./commands/replay.ts";

const cmd = new Command()
  .name("glue")
  .version(denoJson.version)
  .description("Glue CLI utility")
  .action(() => {
    cmd.showHelp();
  })
  .command(
    "upgrade",
    new UpgradeCommand({
      provider: [
        new JsrProvider({ scope: "streak-glue", name: "cli" }),
      ],
      args: ["--unstable-kv", "--unstable-temporal", "--allow-all"],
    }),
  )
  // DEV ----------------------------
  .command(
    "dev",
    "Run a glue locally for development. Your glue is run immediately and your top level triggers are setup. By default a debug port is opened, but can be disabled with --no-debug.",
  )
  .option("-n, --name <name:string>", "Set glue name")
  .option("--inspect-wait", "Enable the debugger and wait for a connection before proceeding with execution.")
  .option("--no-debug", "Disable the debugger")
  .option(
    "--replay <executionId:string>",
    "Replay a specific execution by ID as soon as the glue is locally running. The execution doesn't have to be from the same glue but it does have to have a compatible trigger/label pair. Useful to debug why a deployed glue didn't behave as expected.",
  )
  .arguments("<file:string>")
  .action(dev)
  // DEPLOY ----------------------------
  .command("deploy", "Deploy a glue")
  .option("-n, --name <name:string>", "Glue name")
  .arguments("<file:string>")
  .action(deploy)
  // CREATE ----------------------------
  .command("create", "Create a new glue from a template")
  .arguments("[filename:string]")
  .action(create)
  // LIST ----------------------------
  .command("list", "List all of your deployed glues")
  .option("-nf, --name-filter <nameFilter:string>", "Filter glues by name")
  .option("-j, --json", "Output in JSON format")
  .action(list)
  // PAUSE ----------------------------
  .command("pause", "Pause a deployed glue")
  .arguments("[name:string]")
  .action(pause)
  // RESUME ----------------------------
  .command("resume", "Resume a paused glue")
  .arguments("[name:string]")
  .action(resume)
  // DEPLOYMENTS ----------------------------
  .command(
    "deployments",
    "List all the deployments of a Glue",
  )
  .arguments("[name:string]")
  .option("-j, --json", "Output in JSON format")
  .action(deployments)
  // DESCRIBE ----------------------------
  .command("describe", "Describe a glue or any other resource. Query can be a glue name or any id for any resource")
  .arguments("[query:string]")
  .option("-j, --json", "Output in JSON format")
  .action(describe)
  // REPLAY ----------------------------
  .command("replay", "Replay an execution of a glue")
  .arguments("<executionId:string>")
  .action(replay)
  // TAIL ----------------------------
  .command("tail", "View a live stream of the executions of a glue. Provide a glue name or id.")
  .arguments("[name:string]")
  .option("-j, --json", "Output in JSON format")
  .option("-n, --number <number:number>", "Number of historical executions to print initially", { default: 10 })
  .option("-l --log-lines <logLines:number>", "Number of log lines to print for each execution. Set to 0 to hide log lines", { default: 10 })
  .option("-N, --no-follow", "Don't follow the executions, just print the latest and exit", { default: false })
  .option("-F, --full-log-lines", "Don't clip log lines to the width of the terminal, wrap the full log line. Has no effect in json mode", { default: false })
  .action(tail)
  // LOGIN ----------------------------
  .command("login", "Log in to Glue")
  .action(login)
  // LOGOUT ----------------------------
  .command("logout", "Log out from Glue")
  .action(logout)
  // WHOAMI ----------------------------
  .command("whoami", "Get the current user")
  .action(whoami)
  // SHARE ----------------------------
  .command("share", "Share a glue file by creating a GitHub secret gist")
  .arguments("<file:string>")
  .option("-j, --json", "Output in JSON format")
  .action(share)
  // ACCOUNTS ----------------------------
  .command(
    "accounts",
    new Command()
      .description("List all accounts")
      .option("-j, --json", "Output in JSON format")
      .action(accounts)
      .command("delete", "Delete an account")
      .arguments("[id:string]")
      .action(deleteAccountCmd),
  );
await cmd.parse(Deno.args);
