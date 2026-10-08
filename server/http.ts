import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { ServiceError } from "./services/errors";

/**
 * Wraps an async route handler and turns known errors into JSON responses:
 * validation errors become 400, ServiceErrors use their own status, anything
 * else is logged and becomes a generic 500.
 */
export function handle(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0]?.message ?? "Invalid request", details: error.errors });
      } else if (error instanceof ServiceError) {
        res.status(error.status).json({ error: error.message });
      } else {
        console.error(`${req.method} ${req.path} failed:`, error);
        res.status(500).json({ error: "Something went wrong. Please try again." });
      }
    }
  };
}

/** Parses a numeric :id route parameter, answering 404 for anything else. */
export function idParam(req: Request, name = "id"): number {
  const id = Number(req.params[name]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ServiceError(404, "Not found");
  return id;
}

/**
 * Rejects state-changing requests that aren't JSON. Browsers can't send a
 * cross-site JSON request without a CORS preflight (which we never allow),
 * so this blocks forged form posts on top of the SameSite cookie.
 */
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD" && !req.is("application/json")) {
    res.status(415).json({ error: "Expected a JSON request body" });
    return;
  }
  next();
}
