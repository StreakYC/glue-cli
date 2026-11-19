import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { type GlueDTO, updateGlue } from "../backend.ts";
import { findGlueByName, type WorkspaceOptions } from "../lib/workspaces.ts";
import { askUserForGlues } from "./common.ts";
import { addTags, normalizeTags, removeTags } from "../lib/tagUtils.ts";
import { runStep } from "../ui/utils.ts";

interface TagOptions extends WorkspaceOptions {
  add?: string[];
  remove?: string[];
  replace?: string[];
}

export async function tag(options: TagOptions, ...glueNames: string[]) {
  await checkForAuthCredsOtherwiseExit();

  let glues: GlueDTO[] = [];
  if (glueNames.length) {
    // One at a time, since resolving an ambiguous name may prompt.
    const resolvedGlues = [];
    for (const name of glueNames) {
      resolvedGlues.push(await findGlueByName(name, "deploy", options));
    }
    glues = resolvedGlues.filter((g) => g !== undefined);
    if (glues.length !== glueNames.length) {
      console.error("One or more glues not found.");
      Deno.exit(1);
    }
  } else {
    glues = await askUserForGlues(options);
  }

  const additions = normalizeTags(options.add);
  const removals = normalizeTags(options.remove);
  const replacement = normalizeTags(options.replace);

  if (new Set(additions).intersection(new Set(removals)).size > 0) {
    console.error("Cannot add and remove tags at the same time.");
    Deno.exit(1);
  }

  if (replacement.length) {
    glues.forEach((g) => g.tags = replacement);
  } else {
    glues.forEach((g) => g.tags = addTags(g.tags, additions));
    glues.forEach((g) => g.tags = removeTags(g.tags, removals));
  }

  const updatePromises = glues.map((g) =>
    runStep(`Updating tags for ${g.name}`, () => updateGlue(g.id, { tags: g.tags }))
  );
  await Promise.all(updatePromises);
}
