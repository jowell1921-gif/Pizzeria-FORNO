import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(`FORNO API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
