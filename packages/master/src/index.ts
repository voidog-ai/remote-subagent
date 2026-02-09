import "dotenv/config";
import { startMasterServer } from "./server.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required. Set it in your .env file.");
  process.exit(1);
}
if (!process.env.DASHBOARD_SECRET) {
  console.error("DASHBOARD_SECRET is required. Set it in your .env file.");
  process.exit(1);
}

const config = {
  port: parseInt(process.env.MASTER_PORT || "3100", 10),
  jwtSecret: process.env.JWT_SECRET,
  dashboardSecret: process.env.DASHBOARD_SECRET,
  tlsCertPath: process.env.TLS_CERT_PATH || undefined,
  tlsKeyPath: process.env.TLS_KEY_PATH || undefined,
};

const { logger } = await startMasterServer(config);

// Graceful shutdown
const shutdown = () => {
  logger.info("server", "Shutting down master server...");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
