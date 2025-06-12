import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  const random = Math.random();
  console.log("random", random);
  if (random < 0.5) {
    throw new Error("test");
  }
  console.log("GET request received");
});
