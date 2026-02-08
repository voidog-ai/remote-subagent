import type { Context, Next } from "hono";

export function basicAuth(username: string, password: string) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      c.header("WWW-Authenticate", 'Basic realm="RemoteSubagent Dashboard"');
      return c.text("Unauthorized", 401);
    }

    const encoded = authHeader.slice(6);
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(":");

    if (user !== username || pass !== password) {
      c.header("WWW-Authenticate", 'Basic realm="RemoteSubagent Dashboard"');
      return c.text("Invalid credentials", 401);
    }

    await next();
  };
}
