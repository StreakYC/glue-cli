import { Confirm } from "@cliffy/prompt/confirm";
import { ensureDir, exists } from "@std/fs";
import { bold, green, red, yellow } from "@std/fmt/colors";
import { join } from "@std/path";
import { GLUE_API_SERVER } from "./common.ts";
import { kv } from "./db.ts";
import { runStep } from "./ui/utils.ts";

const GLUE_SKILL_URL =
  "https://raw.githubusercontent.com/StreakYC/glue-skills/master/skills/glue/SKILL.md";
const GLUE_SKILL_NAME = "glue";
const SKILL_INSTALL_PROMPTED_KEY = "skillInstallPrompted";

interface Agent {
  type: "codex" | "claude" | "generic";
  dir: string;
  label: string;
}

const AGENTS: Agent[] = [
  {
    type: "codex",
    dir: ".codex",
    label: "Codex",
  },
  {
    type: "claude",
    dir: ".claude",
    label: "Claude Code",
  },
  {
    type: "generic",
    dir: ".agents",
    label: "Other Agents",
  },
];

export async function installSkills(): Promise<void> {
  const home = requireHomeDirectory();
  const targets = await detectSkillTargets(home);

  if (targets.length === 0) {
    console.log(yellow("!"), "No Codex or Claude Code installation detected.");
    return;
  }

  const skillMarkdown = await runStep(
    "Downloading Glue skill...",
    () => downloadGlueSkillMarkdown(),
    true,
  );

  const installedPaths: string[] = [];
  await runStep(
    `Installing Glue skill for ${targets.map((t) => t.label).join(", ")}...`,
    async () => {
      for (const target of targets) {
        const skillDir = getSkillInstallDir(home, target);
        await ensureDir(skillDir);
        await Deno.writeTextFile(join(skillDir, "SKILL.md"), skillMarkdown);
        installedPaths.push(skillDir);
      }
    },
    true,
  );

  console.log(
    `${green("✔︎")} Installed Glue skill in ${installedPaths.map((path) => bold(path)).join(", ")}`,
  );
}

export async function promptToInstallSkills(): Promise<void> {
  if (!Deno.stdin.isTerminal()) {
    return;
  }
  if (await hasShownSkillInstallPrompt()) {
    return;
  }

  const shouldInstall = await Confirm.prompt({
    message: "Install the Glue agent skill for Codex or Claude Code now?",
    default: true,
  });
  await markSkillInstallPromptShown();

  if (!shouldInstall) {
    return;
  }

  try {
    await installSkills();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${red("✘")} Failed to install Glue skill: ${message}`);
  }
}

function requireHomeDirectory(): string {
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("HOME is not set");
  }
  return home;
}

function detectSkillTargets(home: string): Promise<Agent[]> {
  return Promise.all(AGENTS.filter((agent) => {
    return exists(join(home, agent.dir), { isDirectory: true });
  }));
}

function getSkillInstallDir(home: string, target: Agent): string {
  return join(home, target.dir, "skills", GLUE_SKILL_NAME);
}

async function downloadGlueSkillMarkdown(): Promise<string> {
  const response = await fetch(GLUE_SKILL_URL, {
    headers: {
      "User-Agent": "glue-cli",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download Glue skill: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function hasShownSkillInstallPrompt(): Promise<boolean> {
  return (await kv.get<boolean>([SKILL_INSTALL_PROMPTED_KEY, GLUE_API_SERVER])).value === true;
}

async function markSkillInstallPromptShown(): Promise<void> {
  await kv.set([SKILL_INSTALL_PROMPTED_KEY, GLUE_API_SERVER], true);
}
