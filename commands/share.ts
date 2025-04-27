import { exists } from "@std/fs/exists";
import { runStep } from "../ui/utils.ts";

interface ShareOptions {
  json?: boolean;
}

/**
 * Share a glue file by creating a GitHub secret gist and return the URL
 */
export async function share(options: ShareOptions, file: string) {
  if (!await exists(file)) {
    throw new Error(`File '${file}' does not exist`);
  }

  await runStep("Checking gh CLI installation", async () => {
    try {
      const command = new Deno.Command("gh", {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      });
      const status = await command.output();
      if (!status.success) {
        throw new Error("GitHub CLI tool is not working properly");
      }
    } catch (_e) {
      throw new Error(
        "GitHub CLI tool (gh) is not installed. Please install it from https://cli.github.com/",
      );
    }
  });

  let gistUrl = "";
  await runStep("Creating secret gist", async () => {
    try {
      const command = new Deno.Command("gh", {
        args: ["gist", "create", "--secret", file],
        stdout: "piped",
      });
      const output = await command.output();
      if (!output.success) {
        throw new Error("Failed to create gist");
      }
      
      const decoder = new TextDecoder();
      gistUrl = decoder.decode(output.stdout).trim();
    } catch (_e) {
      throw new Error(`Failed to create gist: ${_e.message}`);
    }
  });

  if (options.json) {
    console.log(JSON.stringify({ url: gistUrl }));
  } else {
    console.log(`Glue file shared successfully!`);
    console.log(`Gist URL: ${gistUrl}`);
  }

  return gistUrl;
}
