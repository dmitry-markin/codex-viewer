import { createMiddleware } from "hono/factory";
import type { HonoContext } from "../app";

// Hostnames considered local. Requests whose Host header (DNS-rebinding
// protection) or Origin header (CSRF protection) resolve outside this set are
// rejected. The server can drive `codex exec --full-auto` and read Codex
// history, so this guard is what keeps a visited website or a rebound DNS name
// from reaching the API even when the port is reachable.
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (value: string): string => {
  // Strip a trailing :port (handles both "host:5656" and "[::1]:5656"),
  // then strip IPv6 brackets, then lowercase.
  return value
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
};

export const securityMiddleware = createMiddleware<HonoContext>(
  async (c, next) => {
    const host = c.req.header("host");
    if (!host || !ALLOWED_HOSTNAMES.has(normalizeHostname(host))) {
      return c.json({ error: "Forbidden host" }, 403);
    }

    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let originHostname: string;
      try {
        originHostname = new URL(origin).hostname;
      } catch {
        return c.json({ error: "Invalid origin" }, 403);
      }
      if (!ALLOWED_HOSTNAMES.has(normalizeHostname(originHostname))) {
        return c.json({ error: "Forbidden origin" }, 403);
      }
    }

    await next();
  },
);
