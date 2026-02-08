import "dotenv/config";
import { loadConfig } from "./config.js";
import { NodeAgent } from "./agent.js";

const config = loadConfig();

if (!config.token) {
  console.error(
    "NODE_TOKEN is required. Generate one with: npm run generate-token <nodeId>",
  );
  process.exit(1);
}

const agent = new NodeAgent(config);
await agent.start();

// Graceful shutdown
const shutdown = async () => {
  console.log("\n[agent] Shutting down...");
  await agent.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Windows fallback
if (process.platform === "win32") {
  process.on("exit", () => {
    agent.stop();
  });
}
