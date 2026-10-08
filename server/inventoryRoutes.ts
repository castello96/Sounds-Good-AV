import { Router } from "express";
import {
  createCategorySchema,
  createUnitsSchema,
  departmentSchema,
  equipmentSchema,
  updateCategorySchema,
  updateEquipmentSchema,
  updateUnitSchema,
} from "@shared/inventory";
import { handle, idParam } from "./http";
import * as inventory from "./services/inventory";

/** Catalog and inventory endpoints, mounted inside the authenticated admin router. */
export function inventoryRouter() {
  const router = Router();

  router.get(
    "/catalog",
    handle(async (_req, res) => {
      res.json(await inventory.getCatalog());
    }),
  );

  router.post(
    "/departments",
    handle(async (req, res) => {
      res.status(201).json(await inventory.createDepartment(req.user!.id, departmentSchema.parse(req.body)));
    }),
  );
  router.patch(
    "/departments/:id",
    handle(async (req, res) => {
      res.json(await inventory.updateDepartment(req.user!.id, idParam(req), departmentSchema.parse(req.body)));
    }),
  );
  router.delete(
    "/departments/:id",
    handle(async (req, res) => {
      await inventory.deleteDepartment(req.user!.id, idParam(req));
      res.status(204).end();
    }),
  );

  router.post(
    "/categories",
    handle(async (req, res) => {
      res.status(201).json(await inventory.createCategory(req.user!.id, createCategorySchema.parse(req.body)));
    }),
  );
  router.patch(
    "/categories/:id",
    handle(async (req, res) => {
      res.json(await inventory.updateCategory(req.user!.id, idParam(req), updateCategorySchema.parse(req.body)));
    }),
  );
  router.delete(
    "/categories/:id",
    handle(async (req, res) => {
      await inventory.deleteCategory(req.user!.id, idParam(req));
      res.status(204).end();
    }),
  );

  router.get(
    "/equipment",
    handle(async (_req, res) => {
      res.json(await inventory.listEquipment());
    }),
  );
  router.get(
    "/equipment/:id",
    handle(async (req, res) => {
      res.json(await inventory.getEquipment(idParam(req)));
    }),
  );
  router.post(
    "/equipment",
    handle(async (req, res) => {
      res.status(201).json(await inventory.createEquipment(req.user!.id, equipmentSchema.parse(req.body)));
    }),
  );
  router.patch(
    "/equipment/:id",
    handle(async (req, res) => {
      res.json(await inventory.updateEquipment(req.user!.id, idParam(req), updateEquipmentSchema.parse(req.body)));
    }),
  );
  router.delete(
    "/equipment/:id",
    handle(async (req, res) => {
      await inventory.deleteEquipment(req.user!.id, idParam(req));
      res.status(204).end();
    }),
  );

  router.post(
    "/equipment/:id/units",
    handle(async (req, res) => {
      const units = await inventory.createUnits(req.user!.id, idParam(req), createUnitsSchema.parse(req.body));
      res.status(201).json(units);
    }),
  );
  router.patch(
    "/units/:id",
    handle(async (req, res) => {
      res.json(await inventory.updateUnit(req.user!.id, idParam(req), updateUnitSchema.parse(req.body)));
    }),
  );
  router.delete(
    "/units/:id",
    handle(async (req, res) => {
      await inventory.deleteUnit(req.user!.id, idParam(req));
      res.status(204).end();
    }),
  );

  return router;
}
