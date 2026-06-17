import { glue } from "jsr:@streak-glue/runtime";

// const secret = glue.secrets.createSecretFetcher("foo3");

glue.webhook.onGet(async (_event) => {
  console.log("webhook triggered");
  // console.log("value:", await secret.get());
});
