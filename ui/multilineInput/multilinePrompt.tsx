import { render } from "ink";
import { MultilineInput } from "./MultilineInput.tsx";

export interface MultilinePromptOptions {
  message?: string;
}

/**
 * Wrapper around MultilineInput component for use outside of Ink apps.
 */
export function multilinePrompt(options?: MultilinePromptOptions): Promise<string> {
  if (options?.message) {
    console.log(options.message);
  }
  return new Promise((resolve) => {
    const root = render(
      <MultilineInput
        onSubmit={(value) => {
          resolve(value);
          root.unmount();
        }}
      />,
    );
  });
}
