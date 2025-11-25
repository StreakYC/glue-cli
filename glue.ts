import { type ArgumentValue, Command, ValidationError } from "@cliffy/command";
import { deploy } from "./commands/deploy.ts";
import { dev } from "./commands/dev.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { whoami } from "./commands/whoami.ts";
import { list } from "./commands/list.ts";
import { describe } from "./commands/describe.ts";
import denoJson from "./deno.json" with { type: "json" };
import { logs } from "./commands/logs.ts";
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import { UpgradeCommand } from "@cliffy/command/upgrade";
import { stop } from "./commands/stop.ts";
import { share } from "./commands/share.ts";
import { accounts, deleteAccountCmd } from "./commands/accounts.ts";
import { create } from "./commands/create.ts";
import { replay } from "./commands/replay.ts";
import { tag } from "./commands/tag.ts";
import { Runner } from "./backend.ts";
import type z from "zod";
import { archive } from "./commands/archive.ts";
import { unarchive } from "./commands/unarchive.ts";

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
  .type("runner", validateWithZodEnum(Runner))
  .option("-r, --runner <runner:runner>", "Use a specific runner to host the glue. Valid values are: deno, fly, cloudflare.", { default: "deno" })
  .option("--tag <tag:string>", "Add tags to the glue (repeatable)", { collect: true })
  .arguments("<file:string>")
  .action(deploy)
  // CREATE ----------------------------
  .command("create", "Create a new glue from a template")
  .arguments("[filename:string]")
  .action(create)
  // LIST ----------------------------
  .command("list", "List all of your deployed glues")
  .option("-n, --name <name:string>", "Filter glues by name")
  .option("-t, --tag <tag:string[]>", "Filter glues by tag", { separator: "," })
  .option("-e, --exclude-tags <excludeTags:string[]>", "Exclude glues by tag", { separator: " " })
  .option("-a, --all", "Show all glues, including archived ones")
  .option("-j, --json", "Output in JSON format")
  .action(list)
  // TAG ----------------------------
  .command("tag", "Add, remove, or replace tags on one or more glues")
  .arguments("[...glueNames:string]")
  .option("-a, --add <tag:string[]>", "Add tags (repeatable)", { separator: "," })
  .option("-r, --remove <tag:string[]>", "Remove tags (repeatable)", { separator: "," })
  .option("-R, --replace <tag:string[]>", "Replace all tags with the provided set (repeatable)", { separator: "," })
  .action(tag)
  // ARCHIVE ----------------------------
  .command("archive", "Archive one or more glues")
  .arguments("[glueNames...:string]")
  .action(archive)
  // UNARCHIVE ----------------------------
  .command("unarchive", "Unarchive one or more glues")
  .arguments("[glueNames...:string]")
  .action(unarchive)
  // STOP ----------------------------
  .command("stop", "Stop a deployed glue")
  .arguments("[name:string]")
  .action(stop)
  // DESCRIBE ----------------------------
  .command("describe", "Describe a glue or any other resource. Query can be a glue name or any id for any resource")
  .arguments("[query:string]")
  .option("-j, --json", "Output in JSON format")
  .option("-w, --watch", "Refresh the description every 3 seconds")
  .action(describe)
  // REPLAY ----------------------------
  .command("replay", "Replay an execution of a glue")
  .arguments("<executionId:string>")
  .action(replay)
  // LOGS ----------------------------
  .command(
    "logs",
    "View historical and live stream of the executions of a glue. Provide a glue name, or glue id, or deployment id or leave blank to list a glue to pick from.",
  )
  .arguments("[query:string]")
  .option("-j, --json", "Output in JSON format")
  .option("-n, --number <number:number>", "Number of historical executions to print initially", { default: 10 })
  .option("-l --log-lines <logLines:number>", "Number of log lines to print for each execution. Set to 0 to hide log lines", { default: 10 })
  .option("-t, --tail", "Live follow the executions as they happen", { default: false })
  .option("-F, --full-log-lines", "Don't clip log lines to the width of the terminal, wrap the full log line. Has no effect in json mode", { default: false })
  .option("-f, --filter <filter:string>", "Filter executions by state. Only show executions with this state. Valid values are: success, failure, running")
  .option("-s, --search <search:string>", "Search for a string in the execution logs, error or input data")
  .option("--failures", "Only show failures, shorthand for --filter=failure")
  .action(logs)
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

// HELPERS --------------------------------
// deno-lint-ignore no-explicit-any
function validateWithZodEnum(zodEnum: z.ZodEnum<any>) {
  return ({ value }: ArgumentValue): z.infer<typeof zodEnum> => {
    const parsed = zodEnum.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(
        `"${value}" is not a valid runner. Valid values are: ${zodEnum.options.join(", ")}`,
      );
    }
    return parsed.data;
  };
}
