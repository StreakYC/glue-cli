import { blue, bold, green } from "@std/fmt/colors";
import { Select } from "@cliffy/prompt/select";
import { Input } from "@cliffy/prompt/input";
import { runStep } from "../ui/utils.ts";
import * as path from "@std/path";
import { Confirm } from "@cliffy/prompt/confirm";
import { delay } from "@std/async/delay";
import { Spinner } from "@std/cli/unstable-spinner";

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
    filename = await Input.prompt({
      message: "Enter the filename for the new glue",
      default: DEFAULT_FILENAME,
    });
    contents = TEMPLATE_CONTENT;
  }
  filename = await uniquifyPath(filename);
  filename = appendFileExtensionIfNotPresent(filename, ".ts");
  await Deno.writeTextFile(filename, contents);
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
  macOSZipeUrl: string;
}

const VSCode: Editor = {
  name: "VSCode",
  command: "code",
  installPage: "https://code.visualstudio.com/download",
  macOSZipeUrl: "https://code.visualstudio.com/download",
};
const Cursor: Editor = {
  name: "Cursor",
  command: "cursor",
  installPage: "https://cursor.com/download",
  macOSZipeUrl: "https://cursor.sh",
};

async function openInEditorFlow(filename: string) {
  console.log();
  const openInEditor = await Confirm.prompt({
    message: "Open created glue in editor?",
    default: true,
  });

  if (openInEditor) {
    let editor = await detectPreferredAndInstalledEditor();
    if (!editor) {
      const installCursor = await Confirm.prompt({
        message: "No editors found, install Cursor (recommended)?",
        default: true,
      });
      if (!installCursor) {
        return;
      }
      await installEditor(Cursor);
      editor = Cursor;
    }
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

async function installEditor(editor: Editor): Promise<void> {
  if (Deno.build.os == "darwin") {
    // TODO in the future we may install for the user
    console.log(`Download and ${editor.name} install from: ${blue(bold(editor.installPage))}`);
  } else {
    console.log(`Download and ${editor.name} install from: ${blue(bold(editor.installPage))}`);
  }

  const spinner = new Spinner({
    message: `Waiting for ${editor.name} to be installed...`,
  });
  spinner.start();

  while (true) {
    try {
      await new Deno.Command(editor.command, { args: ["--version"] }).output();
      break;
    } catch (_e) {
      await delay(1000);
    }
  }
  spinner.stop();
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
