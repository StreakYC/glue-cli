import { assertEquals } from "@std/assert";
import type { WorkspaceDTO } from "../backend.ts";
import { chooseWorkspace, isSamePath, referencedWorkspaces } from "./workspaceChoice.ts";

function workspace(id: string, overrides: Partial<WorkspaceDTO> = {}): WorkspaceDTO {
  return {
    id,
    name: `Workspace ${id}`,
    personal: false,
    role: "owner",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const personal = workspace("w_1", { personal: true });
const team = workspace("w_2");
const other = workspace("w_3", { role: "member" });
const all = [personal, team, other];

Deno.test("chooseWorkspace - uses the requested workspace", () => {
  assertEquals(chooseWorkspace(["w_2"], all, all), { kind: "chosen", workspace: team });
});

Deno.test("chooseWorkspace - requires exactly one requested workspace", () => {
  assertEquals(chooseWorkspace(["w_1", "w_2"], all, all).kind, "error");
});

Deno.test("chooseWorkspace - rejects workspaces the user isn't in", () => {
  assertEquals(chooseWorkspace(["w_9"], all, all), {
    kind: "error",
    message: "You're not a member of workspace w_9.",
  });
});

Deno.test("chooseWorkspace - rejects ineligible requested workspaces", () => {
  assertEquals(chooseWorkspace(["w_3"], [team], all, "isn't one you own"), {
    kind: "error",
    message: "Workspace w_3 isn't one you own.",
  });
});

Deno.test("chooseWorkspace - uses the only eligible workspace", () => {
  assertEquals(chooseWorkspace(undefined, [personal], all), {
    kind: "chosen",
    workspace: personal,
  });
});

Deno.test("chooseWorkspace - asks when several are eligible", () => {
  assertEquals(chooseWorkspace(undefined, [personal, team], all), {
    kind: "ask",
    options: [personal, team],
  });
});

Deno.test("chooseWorkspace - errors when nothing is eligible", () => {
  assertEquals(chooseWorkspace(undefined, [], all, "isn't one you own", "Nope."), {
    kind: "error",
    message: "Nope.",
  });
});

Deno.test("referencedWorkspaces - keeps only referenced workspaces, in order", () => {
  assertEquals(referencedWorkspaces(["w_3", "w_1", "w_3"], all), [personal, other]);
});

Deno.test("isSamePath - ignores case", () => {
  assertEquals(isSamePath("/Users/me/Glue.ts", "/users/me/glue.ts"), true);
  assertEquals(isSamePath("/Users/me/a.ts", "/Users/me/b.ts"), false);
});
