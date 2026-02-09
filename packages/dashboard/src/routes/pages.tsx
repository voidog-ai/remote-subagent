import { Hono } from "hono";
import { Layout } from "../views/layout.js";
import { DashboardView } from "../views/dashboard.js";
import { NodesView } from "../views/nodes.js";
import { LogsView } from "../views/logs.js";
import { ConsoleView } from "../views/console.js";
import { SettingsView } from "../views/settings.js";
import { GraphView } from "../views/graph.js";

interface PageEnv {
  Variables: {
    masterUrl: string;
    dashboardSecret: string;
  };
}

export function createPageRoutes(
  masterUrl: string,
  masterPublicUrl: string,
  dashboardSecret: string,
) {
  const pages = new Hono<PageEnv>();

  const fetchMaster = async (path: string) => {
    const res = await fetch(`${masterUrl}${path}`, {
      headers: { "X-Dashboard-Secret": dashboardSecret },
    });
    return res.json();
  };

  pages.get("/", async (c) => {
    const [nodes, metrics] = await Promise.all([
      fetchMaster("/api/nodes"),
      fetchMaster("/api/metrics"),
    ]);

    const html = (
      <Layout
        title="Dashboard"
        active="/"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <DashboardView nodes={nodes} metrics={metrics} />
      </Layout>
    );
    return c.html(html);
  });

  pages.get("/graph", async (c) => {
    const nodes = await fetchMaster("/api/nodes");

    const html = (
      <Layout
        title="Node Graph"
        active="/graph"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <GraphView nodes={nodes} />
      </Layout>
    );
    return c.html(html);
  });

  pages.get("/nodes", async (c) => {
    const nodes = await fetchMaster("/api/nodes");

    const html = (
      <Layout
        title="Nodes"
        active="/nodes"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <NodesView nodes={nodes} />
      </Layout>
    );
    return c.html(html);
  });

  pages.get("/logs", async (c) => {
    const logs = await fetchMaster("/api/logs?limit=500");
    const sources = [...new Set(logs.map((l: any) => l.source))] as string[];

    const html = (
      <Layout
        title="Logs"
        active="/logs"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <LogsView logs={logs} sources={sources} />
      </Layout>
    );
    return c.html(html);
  });

  pages.get("/console", async (c) => {
    const nodes = await fetchMaster("/api/nodes");
    const selectedTarget = c.req.query("target");

    const html = (
      <Layout
        title="Console"
        active="/console"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <ConsoleView nodes={nodes} selectedTarget={selectedTarget} />
      </Layout>
    );
    return c.html(html);
  });

  pages.get("/settings", async (c) => {
    const metrics = await fetchMaster("/api/metrics");
    const port = new URL(masterUrl).port || "3100";

    const html = (
      <Layout
        title="Settings"
        active="/settings"
        masterUrl={masterUrl}
        masterPublicUrl={masterPublicUrl}
        dashboardSecret={dashboardSecret}
      >
        <SettingsView
          metrics={metrics}
          masterUrl={masterUrl}
          masterPort={port}
        />
      </Layout>
    );
    return c.html(html);
  });

  return pages;
}
