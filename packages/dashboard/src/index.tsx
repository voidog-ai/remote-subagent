import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { basicAuth } from "./middleware/auth.js";
import { createPageRoutes } from "./routes/pages.js";
import { createApiRoutes } from "./routes/api.js";

const port = parseInt(process.env.DASHBOARD_PORT || "3200", 10);
const username = process.env.DASHBOARD_USER || "admin";
const password = process.env.DASHBOARD_PASSWORD || "changeme";
const masterUrl = process.env.MASTER_URL || "http://localhost:3100";
const dashboardSecret =
  process.env.DASHBOARD_SECRET || "dev-dashboard-secret";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dist, public files are at ../src/public; in dev, at ./public
const publicDir = path.resolve(__dirname, "..", "src", "public");

const app = new Hono();

// Static files (no auth required for assets)
app.get("/public/:file", async (c) => {
  const fileName = c.req.param("file");
  const filePath = path.join(publicDir, fileName);
  try {
    const content = readFileSync(filePath, "utf-8");
    const ext = path.extname(fileName);
    const contentType =
      ext === ".css"
        ? "text/css"
        : ext === ".js"
          ? "application/javascript"
          : "text/plain";
    return c.body(content, 200, { "Content-Type": contentType });
  } catch {
    return c.text("Not found", 404);
  }
});

// Basic Auth for all other routes
app.use("*", basicAuth(username, password));

// API routes (proxied to master)
app.route("/api", createApiRoutes(masterUrl, dashboardSecret));

// Page routes
app.route("/", createPageRoutes(masterUrl, dashboardSecret));

console.log(`Dashboard starting on port ${port}`);
console.log(`Master URL: ${masterUrl}`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Dashboard running at http://localhost:${port}`);
