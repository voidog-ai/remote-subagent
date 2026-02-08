import { Hono } from "hono";

export function createApiRoutes(
  masterUrl: string,
  dashboardSecret: string,
) {
  const api = new Hono();

  // Proxy all API calls to master with X-Dashboard-Secret
  const proxyToMaster = async (
    path: string,
    method: string,
    body?: string,
  ) => {
    const headers: Record<string, string> = {
      "X-Dashboard-Secret": dashboardSecret,
      "Content-Type": "application/json",
    };

    const res = await fetch(`${masterUrl}${path}`, {
      method,
      headers,
      ...(body && { body }),
    });

    return {
      status: res.status,
      body: await res.text(),
      contentType: res.headers.get("Content-Type") || "application/json",
    };
  };

  // GET /api/nodes
  api.get("/nodes", async (c) => {
    const result = await proxyToMaster("/api/nodes", "GET");
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // GET /api/logs
  api.get("/logs", async (c) => {
    const params = new URL(c.req.url).searchParams.toString();
    const path = `/api/logs${params ? `?${params}` : ""}`;
    const result = await proxyToMaster(path, "GET");
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // POST /api/command
  api.post("/command", async (c) => {
    const body = await c.req.text();
    const result = await proxyToMaster("/api/command", "POST", body);
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // GET /api/metrics
  api.get("/metrics", async (c) => {
    const result = await proxyToMaster("/api/metrics", "GET");
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // GET /api/tasks
  api.get("/tasks", async (c) => {
    const params = new URL(c.req.url).searchParams.toString();
    const path = `/api/tasks${params ? `?${params}` : ""}`;
    const result = await proxyToMaster(path, "GET");
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // POST /api/tokens
  api.post("/tokens", async (c) => {
    const body = await c.req.text();
    const result = await proxyToMaster("/api/tokens", "POST", body);
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  // DELETE /api/tasks/:id
  api.delete("/tasks/:id", async (c) => {
    const id = c.req.param("id");
    const result = await proxyToMaster(`/api/tasks/${id}`, "DELETE");
    return c.body(result.body, result.status as any, {
      "Content-Type": result.contentType,
    });
  });

  return api;
}
