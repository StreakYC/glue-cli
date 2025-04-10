import { glue } from "jsr:@streak-glue/runtime";

glue.github.onRepoEvent("StreakYC", "glue-backend", ["issues"], (event) => {
  console.log(`issue event: ${JSON.stringify(event)}`);
});
