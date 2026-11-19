import { assertEquals } from "@std/assert";
import type { WorkspaceDTO } from "../backend.ts";
import { describeWorkspace, referencedWorkspaces } from "./workspaceChoice.ts";

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

Deno.test("describeWorkspace - shows the id alone when the name isn't known", () => {
  assertEquals(describeWorkspace({ id: "w_9" }), "w_9");
  assertEquals(describeWorkspace(personal), "Workspace w_1 (w_1, personal)");
});

Deno.test("referencedWorkspaces - keeps only referenced workspaces, in order", () => {
  assertEquals(referencedWorkspaces(["w_3", "w_1", "w_3"], all), [personal, other]);
});
