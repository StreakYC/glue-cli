import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getGlueByName, type GlueDTO, updateGlue } from "../backend.ts";
import { askUserForGlues } from "./common.ts";
import { addTags, normalizeTags, removeTags } from "../lib/tagUtils.ts";
import { runStep } from "../ui/utils.ts";

interface TagOptions {
  add?: string[];
  remove?: string[];
  replace?: string[];
}

export async function tag(options: TagOptions, ...glueNames: string[]) {
  await checkForAuthCredsOtherwiseExit();

  let glues: GlueDTO[] = [];
  if (glueNames.length) {
    const gluePromises = glueNames.map((n) => getGlueByName(n, "deploy"));
    const resolvedGlues = await runStep(`Loading glue${glueNames.length === 1 ? "" : "s"}...`, () => Promise.all(gluePromises));
    glues = resolvedGlues.filter((g) => g !== undefined);
    if (glues.length !== glueNames.length) {
      console.error("One or more glues not found.");
      Deno.exit(1);
    }
  } else {
    glues = await askUserForGlues();
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

  const updatePromises = glues.map((g) => runStep(`Updating tags for ${g.name}`, () => updateGlue(g.id, { tags: g.tags })));
  await Promise.all(updatePromises);
}
