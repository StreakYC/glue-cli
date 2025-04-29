import { exists } from "@std/fs/exists";
import { bold, green } from "@std/fmt/colors";

const DEFAULT_FILENAME = "myGlue.ts";
const TEMPLATE_CONTENT = `import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("GET request received");
});
`;

/**
 * Create a new glue file with a template
 */
export async function create(_options: void, filename?: string) {
  const targetFilename = filename || DEFAULT_FILENAME;

  if (await exists(targetFilename)) {
    throw new Error(`File '${targetFilename}' already exists. Please specify a different filename.`);
  }

  await Deno.writeTextFile(targetFilename, TEMPLATE_CONTENT);

  console.log(`${green("✓")} Successfully created new glue file: ${bold(targetFilename)}`);
  console.log(`Run the following command to start developing:`);
  console.log(`  glue dev ${targetFilename}`);

  return targetFilename;
}
