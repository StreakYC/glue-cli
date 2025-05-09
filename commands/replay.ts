import { runStep } from "../ui/utils.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { replayExecution } from "../backend.ts";

export const replay = async (_options: Record<string, never>, executionId: string) => {
  await checkForAuthCredsOtherwiseExit();
  await runStep("Replaying execution...", () => replayExecution(executionId));
};
