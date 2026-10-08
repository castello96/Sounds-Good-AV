import connectPgSimple from "connect-pg-simple";
import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import passport from "passport";
import { changePasswordSchema, loginSchema, type PublicUser } from "@shared/users";
import config from "./config";
import { pool } from "./db";
import { handle, requireJson } from "./http";
import { authenticate, changeOwnPassword, findActiveUser } from "./services/users";

declare global {
  namespace Express {
    // What passport puts on req.user.
    interface User extends PublicUser {}
  }
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Only the staff APIs use sessions; the public site never touches the session table.
export const SESSION_PATHS = ["/api/auth", "/api/admin"];

function sessionSecret(): string {
  const secret = config.get("session.secret");
  if (secret) return secret;
  if (config.get("env") === "production") {
    throw new Error("SESSION_SECRET is not set. Add it to the Render environment.");
  }
  console.warn("SESSION_SECRET is not set; using an insecure development secret.");
  return "dev-only-session-secret";
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: "Please log in" });
}

/** Installs sessions and passport, and registers /api/auth/*. */
export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id: number, done) => {
    // A deactivated user loses access on their next request.
    findActiveUser(id).then((user) => done(null, user ?? false), done);
  });

  app.use(
    SESSION_PATHS,
    requireJson,
    session({
      store: new PgStore({ pool, tableName: "user_sessions" }),
      name: "sgav.sid",
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      // Each request pushes expiry out, so active staff stay logged in.
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.get("env") === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
    passport.initialize(),
    passport.session(),
  );

  app.post(
    "/api/auth/login",
    loginLimiter,
    handle(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);
      const user = await authenticate(email, password);
      if (!user) {
        res.status(401).json({ error: "Incorrect email or password" });
        return;
      }
      // Passport starts a fresh session here, which prevents session fixation.
      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve())),
      );
      res.json(user);
    }),
  );

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("sgav.sid");
        res.status(204).end();
      });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  app.post(
    "/api/auth/password",
    requireAuth,
    handle(async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      await changeOwnPassword(req.user!.id, req.sessionID, input);
      res.status(204).end();
    }),
  );
}
