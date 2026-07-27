import { spawn } from "node:child_process";
import { resolve } from "node:path";

const command = process.argv[2];
if (!command) throw new Error("Expected a vinext command such as dev, build, or start.");

const child = spawn(process.execPath, [resolve("node_modules/vinext/dist/cli.js"), command], {
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || ".wrangler/wrangler.log",
  },
});

child.on("exit", code => process.exit(code ?? 1));