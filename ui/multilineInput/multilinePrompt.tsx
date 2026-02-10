import { render } from "ink";
import { MultilineInput } from "./MultilineInput.tsx";

export interface MultilinePromptOptions {
  message?: string;
  /**
   * When enabled, pressing ctrl+c will exit the process instead of throwing an error.
   *
   * @default true
   */
  exitOnCtrlC?: boolean;
}

/**
 * Wrapper around {@link MultilineInput} component for use outside of Ink apps.
 */
export function multilinePrompt(options?: MultilinePromptOptions): Promise<string> {
  if (options?.message) {
    console.log(options.message);
  }
  return new Promise((resolve, reject) => {
    const exitOnCtrlC = options?.exitOnCtrlC ?? true;
    let didSubmit = false;
    const root = render(
      <MultilineInput
        onSubmit={(value) => {
          didSubmit = true;
          resolve(value);
          root.unmount();
        }}
      />,
    );
    root.waitUntilExit().then(
      () => {
        if (didSubmit) return;
        if (exitOnCtrlC) {
          Deno.exit(130);
        }
        reject(new Error("Multiline prompt aborted"));
      },
      reject,
    );
  });
}
