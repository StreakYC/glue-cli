import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onPost(async (event) => {
  const body = event.bodyText || "<empty body>";
  console.log("Received webhook with body:", body);
  await delayedTask.schedule(body, { delay: "5 seconds" });
});

const delayedTask = glue.tasks.createDelayedTask((event: string) => {
  console.log("Delayed task executed with body:", event);
});
