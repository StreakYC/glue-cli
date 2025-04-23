import { glue } from "jsr:@streak-glue/runtime";

glue.github.onRepoEvent("StreakYC", "glue-backend", ["issues"], (event) => {
  // deno-lint-ignore no-explicit-any
  const payload = event.payload as any;
  console.log(`event.payload.action: ${payload.action}`);
  console.log(`event.payload.issue.title: ${payload.issue.title}`);
});
