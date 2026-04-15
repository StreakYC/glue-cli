import { bold, green } from "@std/fmt/colors";
import { Input } from "@cliffy/prompt/input";
import * as path from "@std/path";
import { Confirm } from "@cliffy/prompt/confirm";
import { promptToInstallSkills } from "./skills.ts";
import type { CommonCommandOptions } from "./common.ts";

const DEFAULT_FILENAME = "myGlue.ts";
const TEMPLATE_CONTENT = `import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("GET request received");
});
`;

export async function create(_options: CommonCommandOptions) {
  let filename = await Input.prompt({
    message: "Enter the filename for the new glue",
    default: DEFAULT_FILENAME,
  });
  const code = TEMPLATE_CONTENT;
  filename = appendFileExtensionIfNotPresent(filename, ".ts");
  filename = await uniquifyPath(filename);
  await Deno.writeTextFile(filename, code, { createNew: true });
  console.log(`${green("✔︎")} Successfully created new glue file: ${bold(filename)}`);

  await promptToInstallSkills();

  await openInEditorFlow(filename);
  console.log();
  console.log(`💡 Run locally using ${green("glue dev " + filename)}`);
  return filename;
}

const defaultEditors = ["cursor", "code", "zed"];

async function openInEditorFlow(filename: string) {
  const editor = await detectPreferredAndInstalledEditor();
  if (!editor) {
    console.log();
    console.log("Couldn't detect a preferred IDE installed on your system.");
    console.log("You may open the created glue file in any text editor.");
    console.log(
      "We recommend using an IDE such as Cursor (https://cursor.com/) or\nVisual Studio Code (https://code.visualstudio.com/).",
    );
    return;
  }

  console.log();
  const openInEditor = await Confirm.prompt({
    message: `Open created glue in editor? (Detected: ${editor})`,
    default: true,
  });

  if (openInEditor) {
    await openEditor(editor, filename);
  }
}

async function detectPreferredAndInstalledEditor(): Promise<string | undefined> {
  const editorEnv = Deno.env.get("EDITOR");
  const firstTerm = editorEnv?.split(/\s+/)[0];
  if (firstTerm && defaultEditors.includes(firstTerm)) {
    return firstTerm;
  }
  for (const cmd of defaultEditors) {
    if (await isEditorInstalled(cmd)) {
      return cmd;
    }
  }
  return undefined;
}

async function isEditorInstalled(editorCommand: string): Promise<boolean> {
  try {
    await new Deno.Command(editorCommand, { args: ["--version"] }).output();
    return true;
  } catch (_error) {
    return false;
  }
}

async function openEditor(editorCommand: string, filename: string): Promise<void> {
  await new Deno.Command(editorCommand, { args: [filename] }).output();
}

function appendFileExtensionIfNotPresent(filename: string, extension: string): string {
  if (!filename.endsWith(extension)) {
    return filename + extension;
  }
  return filename;
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
