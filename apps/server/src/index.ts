import { buildApp } from "./app.js";
import { DEMO_DIR } from "./capture.js";
import { loadConfig } from "./config.js";
import { demoSource } from "./demo.js";

const config = loadConfig();
const demo = process.env.VOICE_OUT_DEMO === "1" ? demoSource() : null;
const capture = process.env.VOICE_OUT_CAPTURE === "1";

const app = buildApp(
  config,
  demo
    ? {
        transcribe: async () => demo.transcript(0),
        clean: async (words, mustKeep, recordedOn) => demo.clean(words, mustKeep, recordedOn),
        demo: true,
      }
    : { captureDir: capture ? DEMO_DIR : undefined },
);

app.listen({ port: config.port, host: "127.0.0.1" }).then(
  () => {
    if (demo) app.log.info(`Demo mode: every recording becomes ${demo.description}.`);
    if (capture) app.log.info(`Capture mode: each memo you record is saved to ${DEMO_DIR} (the last take wins).`);
  },
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);
