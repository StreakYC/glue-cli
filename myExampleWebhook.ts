import { glue } from "jsr:@streak-glue/runtime";

glue.github.onRepoEvent("StreakYC", "glue-backend", ["issues"], (event) => {
  console.log(`event.payload.action: ${event.payload.action}`);
  console.log(`event.payload.issue.title: ${event.payload.issue.title}`);
});
