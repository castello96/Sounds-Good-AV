import { Router, type Express } from "express";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@shared/users";
import { requireAuth } from "./auth";
import { handle, idParam } from "./http";
import { inventoryRouter } from "./inventoryRoutes";
import { createUser, listUsers, resetPassword, updateUser } from "./services/users";

/** Staff-only API. Everything under /api/admin requires a logged-in user. */
export function registerAdminRoutes(app: Express) {
  const admin = Router();
  admin.use(requireAuth);

  admin.get(
    "/users",
    handle(async (_req, res) => {
      res.json(await listUsers());
    }),
  );

  admin.post(
    "/users",
    handle(async (req, res) => {
      const input = createUserSchema.parse(req.body);
      res.status(201).json(await createUser(req.user!.id, input));
    }),
  );

  admin.patch(
    "/users/:id",
    handle(async (req, res) => {
      const input = updateUserSchema.parse(req.body);
      res.json(await updateUser(req.user!.id, idParam(req), input));
    }),
  );

  admin.post(
    "/users/:id/password",
    handle(async (req, res) => {
      const { password } = resetPasswordSchema.parse(req.body);
      await resetPassword(req.user!.id, idParam(req), password);
      res.status(204).end();
    }),
  );

  admin.use(inventoryRouter());

  // Unknown admin endpoints get JSON, not the SPA's index.html.
  admin.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use("/api/admin", admin);
}
