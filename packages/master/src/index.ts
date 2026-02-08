import "dotenv/config";
import { startMasterServer } from "./server.js";

const config = {
  port: parseInt(process.env.MASTER_PORT || "3100", 10),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  dashboardSecret: process.env.DASHBOARD_SECRET || "dev-dashboard-secret",
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
