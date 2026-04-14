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
  await promptToInstallSkills();

  let filename = await Input.prompt({
    message: "Enter the filename for the new glue",
    default: DEFAULT_FILENAME,
  });
  const code = TEMPLATE_CONTENT;
  filename = await uniquifyPath(filename);
  filename = appendFileExtensionIfNotPresent(filename, ".ts");
  await Deno.writeTextFile(filename, code);
  console.log(`${green("✔︎")} Successfully created new glue file: ${bold(filename)}`);

  await openInEditorFlow(filename);
  console.log();
  console.log(`💡 Run locally using ${green("glue dev " + filename)}`);
  return filename;
}

interface Editor {
  name: string;
  command: string;
  installPage: string;
  macOSDownloadUrl: string;
}

const VSCode: Editor = {
  name: "VSCode",
  command: "code",
  installPage: "https://code.visualstudio.com/download",
  macOSDownloadUrl: "https://code.visualstudio.com/download",
};
const Cursor: Editor = {
  name: "Cursor",
  command: "cursor",
  installPage: "https://cursor.com/download",
  macOSDownloadUrl: "https://cursor.sh",
};

async function openInEditorFlow(filename: string) {
  const editor = await detectPreferredAndInstalledEditor();
  if (!editor) {
    return;
  }

  console.log();
  const openInEditor = await Confirm.prompt({
    message: "Open created glue in editor?",
    default: true,
  });

  if (openInEditor) {
    await openEditor(editor, filename);
  }
}

async function detectPreferredAndInstalledEditor(): Promise<Editor | undefined> {
  const editorEnv = Deno.env.get("EDITOR");
  const firstTerm = editorEnv?.split(/\s+/)[0];
  if (firstTerm === VSCode.command) {
    return VSCode;
  }
  if (firstTerm === Cursor.command) {
    return Cursor;
  }

  if (await isEditorInstalled(Cursor)) {
    return Cursor;
  }
  if (await isEditorInstalled(VSCode)) {
    return VSCode;
  }
  return undefined;
}

async function isEditorInstalled(editor: Editor): Promise<boolean> {
  try {
    await new Deno.Command(editor.command, { args: ["--version"] }).output();
    return true;
  } catch (_error) {
    return false;
  }
}

async function openEditor(editor: Editor, filename: string): Promise<void> {
  await new Deno.Command(editor.command, { args: [filename] }).output();
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
