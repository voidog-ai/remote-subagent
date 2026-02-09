import type { FC } from "hono/jsx";
import { Nav } from "../components/nav.js";

interface LayoutProps {
  title: string;
  active: string;
  masterUrl: string;
  masterPublicUrl: string;
  dashboardSecret: string;
  children: any;
}

export const Layout: FC<LayoutProps> = ({
  title,
  active,
  masterUrl,
  masterPublicUrl,
  dashboardSecret,
  children,
}) => {
  const cacheBust = `v=${Date.now()}`;
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - RemoteSubagent</title>
        <link rel="stylesheet" href={`/public/styles.css?${cacheBust}`} />
      </head>
      <body>
        <div class="app-layout">
          <Nav active={active} />
          <main class="main-content">{children}</main>
        </div>

        {/* Socket.IO + HTMX scripts (ADR-15) */}
        <script
          src={`${masterPublicUrl}/socket.io/socket.io.js`}
          crossorigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__MASTER_URL__ = ${JSON.stringify(masterPublicUrl)};
              window.__DASHBOARD_SECRET__ = ${JSON.stringify(dashboardSecret)};
            `,
          }}
        />
        <script src={`/public/marked.min.js?${cacheBust}`} />
        <script src={`/public/app.js?${cacheBust}`} />
      </body>
    </html>
  );
};
