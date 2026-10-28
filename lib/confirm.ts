import { Confirm } from "@cliffy/prompt/confirm";
import { UserFacingError } from "./UserFacingError.ts";

/**
 * Asks the user to confirm, unless `--yes` was passed. Outside a terminal the
 * prompt couldn't be answered, so `--yes` is required.
 */
export async function confirmUnlessYes(message: string, yes: boolean | undefined) {
  if (yes) {
    return true;
  }
  if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
    throw new UserFacingError("Pass --yes to confirm when not running in a terminal");
  }
  return await Confirm.prompt({ message, default: false });
}
