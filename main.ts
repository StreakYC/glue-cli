import { kv } from "./db.ts";
import { Input } from "@cliffy/prompt";
import { Command } from "@cliffy/command";
import { basename, dirname, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import { GLUE_API_SERVER } from "./common.ts";
import { logout } from "./commands/logout.ts";
import { dev } from "./commands/dev.ts";

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
  .action(dev)
  .command("deploy", "Deploy a glue") // --name flag
  .option("-n, --name <name:string>", "Glue name") // defaults based on file name
  .arguments("<file:string>")
  .action(async (options, file) => {
    const glueName = options.name ?? basename(file);

    // For now, we're just uploading all .js/.ts files in the same directory as
    // the entry point. TODO follow imports and only upload necessary files.
    const fileDir = dirname(file);

    const entryFile = basename(file);

    const filesToUpload: string[] = [entryFile];
    for await (
      const dirEntry of walk(fileDir, {
        exts: ["ts", "js"],
        includeDirs: false,
      })
    ) {
      const relativePath = relative(fileDir, dirEntry.path);
      filesToUpload.push(relativePath);
    }

    const assets: Record<string, string> = Object.fromEntries(
      await Promise.all(filesToUpload
        .map(async (file) => [file, await Deno.readTextFile(file)])),
    );

    const body = {
      name: glueName,
      entryPointUrl: entryFile,
      assets,
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
    const signupRes = await fetch(`${GLUE_API_SERVER}/signup`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (
      signupRes.status === 400 &&
      /^application\/json(^|;)/.test(
        signupRes.headers.get("Content-Type") ?? "",
      ) &&
      (await signupRes.json()).error === "User already exists"
    ) {
      // it's fine
    } else if (!signupRes.ok) {
      console.log("status", signupRes.status);
      console.log("header", signupRes.headers.get("Content-Type"));
      throw new Error(`Failed to sign up: ${signupRes.statusText}`);
    }
    await kv.set(["userEmail"], email);
    console.log(`Logged in as ${JSON.stringify(email)}`);
  })
  .command("logout", "Log out from Glue")
  .action(logout)
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
