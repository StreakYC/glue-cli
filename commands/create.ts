import { bold, green } from "@std/fmt/colors";
import { Select } from "@cliffy/prompt/select";
import { Input } from "@cliffy/prompt/input";
import { runStep } from "../ui/utils.ts";
import * as path from "jsr:@std/path";

const DEFAULT_FILENAME = "myGlue.ts";
const TEMPLATE_CONTENT = `import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("GET request received");
});
`;

export async function create(_options: void) {
  const creationType: string = await Select.prompt({
    message: "How do you want to start your glue?",
    options: [
      { name: "Code generation", value: "codegen" },
      { name: "Blank scaffold", value: "blank" },
    ],
  });

  let filename: string;
  let contents: string;
  if (creationType === "codegen") {
    const description = await Input.prompt("Enter the description for the new glue");
    const codeGenResult = await runStep("Generating glue code...", () => doCodeGen(description));
    filename = codeGenResult.filename;
    contents = codeGenResult.fileContents;
  } else {
    filename = await Input.prompt({ message: "Enter the filename for the new glue", default: DEFAULT_FILENAME });
    contents = TEMPLATE_CONTENT;
  }
  filename = await uniquifyPath(filename);
  await Deno.writeTextFile(filename, contents);
  console.log(`${green("✔︎")} Successfully created new glue file: ${bold(filename)}`);
  console.log();
  console.log(`Run locally using 'glue dev ${filename}':`);

  return filename;
}

interface CodeGenResult {
  filename: string;
  fileContents: string;
}

function doCodeGen(_prompt: string): Promise<CodeGenResult> {
  return Promise.resolve({ filename: "myGlue.ts", fileContents: TEMPLATE_CONTENT });
}

/**
 * Returns a non-conflicting file path by appending _N before the extension.
 * Example: "report.txt" → "report_1.txt" → "report_2.txt"
 */
export async function uniquifyPath(filePath: string): Promise<string> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  let candidate = filePath;
  let counter = 1;

  while (true) {
    try {
      // If this succeeds, file exists → try next N
      await Deno.stat(candidate);
      candidate = path.join(dir, `${base}_${counter}${ext}`);
      counter++;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        // File does not exist → safe to use
        return candidate;
      }
      throw err;
    }
  }
}
