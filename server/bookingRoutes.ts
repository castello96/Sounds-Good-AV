import { Router } from "express";
import { z } from "zod";
import {
  bookingDetailsSchema,
  bookingItemSchema,
  bookingListQuerySchema,
  bookingStatusSchema,
  createBookingSchema,
  customerSchema,
} from "@shared/bookings";
import { itemCountsSchema, lostUnitSchema, packUnitSchema, returnUnitSchema } from "@shared/packout";
import { paymentSchema } from "@shared/payments";
import { handle, idParam } from "./http";
import * as bookings from "./services/bookings";
import * as dashboard from "./services/dashboard";
import * as history from "./services/history";
import * as packout from "./services/packout";
import * as payments from "./services/payments";

const searchSchema = z.object({ q: z.string().max(200).default("") });

/** Booking, payment and customer endpoints, mounted inside the authenticated admin router. */
export function bookingRouter() {
  const router = Router();

  router.get(
    "/bookings",
    handle(async (req, res) => {
      res.json(await bookings.listBookings(bookingListQuerySchema.parse(req.query).status));
    }),
  );
  router.get(
    "/bookings/counts",
    handle(async (_req, res) => {
      res.json(await bookings.bookingCounts());
    }),
  );
  // Before /bookings/:id, so "out" isn't taken for an id.
  router.get(
    "/bookings/out",
    handle(async (_req, res) => {
      res.json(await bookings.listOutNow());
    }),
  );
  router.get(
    "/dashboard",
    handle(async (_req, res) => {
      res.json(await dashboard.getDashboard());
    }),
  );
  router.get(
    "/bookings/:id/history",
    handle(async (req, res) => {
      res.json(await history.bookingHistory(idParam(req)));
    }),
  );
  router.post(
    "/bookings",
    handle(async (req, res) => {
      const id = await bookings.createBooking(req.user!.id, createBookingSchema.parse(req.body));
      res.status(201).json(await bookings.getBooking(id));
    }),
  );
  router.get(
    "/bookings/:id",
    handle(async (req, res) => {
      res.json(await bookings.getBooking(idParam(req)));
    }),
  );
  router.put(
    "/bookings/:id",
    handle(async (req, res) => {
      res.json(await bookings.updateBookingDetails(req.user!.id, idParam(req), bookingDetailsSchema.parse(req.body)));
    }),
  );
  router.post(
    "/bookings/:id/status",
    handle(async (req, res) => {
      const { status } = bookingStatusSchema.parse(req.body);
      res.json(await bookings.changeBookingStatus(req.user!.id, idParam(req), status));
    }),
  );
  router.get(
    "/bookings/:id/availability",
    handle(async (req, res) => {
      res.json(await bookings.bookingAvailability(idParam(req)));
    }),
  );
  router.put(
    "/bookings/:id/items/:equipmentId",
    handle(async (req, res) => {
      const { quantity } = bookingItemSchema.parse(req.body);
      res.json(await bookings.setBookingItem(req.user!.id, idParam(req), idParam(req, "equipmentId"), quantity));
    }),
  );
  router.delete(
    "/bookings/:id/items/:equipmentId",
    handle(async (req, res) => {
      res.json(await bookings.removeBookingItem(req.user!.id, idParam(req), idParam(req, "equipmentId")));
    }),
  );

  router.post(
    "/bookings/:id/pack",
    handle(async (req, res) => {
      const { assetTag } = packUnitSchema.parse(req.body);
      res.json(await packout.packUnit(req.user!.id, idParam(req), assetTag));
    }),
  );
  router.delete(
    "/bookings/:id/units/:unitId",
    handle(async (req, res) => {
      res.json(await packout.unpackUnit(req.user!.id, idParam(req), idParam(req, "unitId")));
    }),
  );
  router.post(
    "/bookings/:id/return",
    handle(async (req, res) => {
      res.json(await packout.returnUnit(req.user!.id, idParam(req), returnUnitSchema.parse(req.body)));
    }),
  );
  router.post(
    "/bookings/:id/units/:unitId/lost",
    handle(async (req, res) => {
      const data = lostUnitSchema.parse(req.body);
      res.json(await packout.markUnitLost(req.user!.id, idParam(req), idParam(req, "unitId"), data));
    }),
  );
  router.patch(
    "/bookings/:id/items/:equipmentId/counts",
    handle(async (req, res) => {
      const data = itemCountsSchema.parse(req.body);
      res.json(await packout.setItemCounts(req.user!.id, idParam(req), idParam(req, "equipmentId"), data));
    }),
  );

  router.post(
    "/bookings/:id/payments",
    handle(async (req, res) => {
      res.status(201).json(await payments.recordPayment(req.user!.id, idParam(req), paymentSchema.parse(req.body)));
    }),
  );
  router.put(
    "/bookings/:id/payments/:paymentId",
    handle(async (req, res) => {
      const data = paymentSchema.parse(req.body);
      res.json(await payments.updatePayment(req.user!.id, idParam(req), idParam(req, "paymentId"), data));
    }),
  );
  router.delete(
    "/bookings/:id/payments/:paymentId",
    handle(async (req, res) => {
      res.json(await payments.deletePayment(req.user!.id, idParam(req), idParam(req, "paymentId")));
    }),
  );

  router.get(
    "/customers",
    handle(async (req, res) => {
      res.json(await bookings.searchCustomers(searchSchema.parse(req.query).q));
    }),
  );
  router.patch(
    "/customers/:id",
    handle(async (req, res) => {
      res.json(await bookings.updateCustomer(req.user!.id, idParam(req), customerSchema.parse(req.body)));
    }),
  );

  return router;
}
