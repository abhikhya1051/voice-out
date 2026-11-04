import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { demoClean, demoTranscript } from "./demo.js";

const config = loadConfig();
const demo = process.env.VOICE_OUT_DEMO === "1";

const app = buildApp(
  config,
  demo
    ? {
        transcribe: async () => demoTranscript(0),
        clean: async (words, mustKeep, recordedOn) => demoClean(words, mustKeep, recordedOn),
        demo: true,
      }
    : {},
);

app.listen({ port: config.port, host: "127.0.0.1" }).then(
  () => demo && app.log.info("Demo mode: every recording becomes the sample memo, with a recorded Claude cleanup."),
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);
