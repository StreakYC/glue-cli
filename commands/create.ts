import { exists } from "@std/fs/exists";
import { runStep } from "../ui/utils.ts";
import { bold, green } from "@std/fmt/colors";
import * as path from "@std/path";

interface CreateOptions {
  json?: boolean;
}

const DEFAULT_FILENAME = "myGlue.ts";
const TEMPLATE_CONTENT = `import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("GET request received");
});
`;

/**
 * Create a new glue file with a template
 */
export async function create(options: CreateOptions, filename?: string) {
  const targetFilename = filename || DEFAULT_FILENAME;

  if (await exists(targetFilename)) {
    throw new Error(`File '${targetFilename}' already exists. Please specify a different filename.`);
  }

  await runStep(`Creating new glue file: ${targetFilename}`, async () => {
    await Deno.writeTextFile(targetFilename, TEMPLATE_CONTENT);
  });

  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      filename: targetFilename,
      absolute_path: path.resolve(targetFilename),
    }));
  } else {
    console.log(`${green("✓")} Successfully created new glue file: ${bold(targetFilename)}`);
    console.log(`Run the following command to start developing:`);
    console.log(`  glue dev ${targetFilename}`);
  }

  return targetFilename;
}
