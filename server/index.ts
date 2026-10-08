import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import config from "./config";

const app = express();

// Render sits behind one proxy. Needed for real client IPs (rate limiting)
// and, later, secure session cookies.
if (config.get("env") === "production") {
  app.set("trust proxy", 1);
}

// Keep the staff portal out of search results.
app.use(["/admin", "/api/auth", "/api/admin"], (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request log. Response bodies are deliberately not logged: they contain customer details.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (config.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = config.get("server.port");
  const host = config.get("server.host");
  const env = config.get("env");
  
  server.listen(port, host, () => {
    log(`serving on port ${port}`);
    log(`🚀 Server running on ${host}:${port} (${env})`);
  });
})();
