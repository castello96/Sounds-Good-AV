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
import { handle, idParam } from "./http";
import * as bookings from "./services/bookings";

const searchSchema = z.object({ q: z.string().max(200).default("") });

/** Booking and customer endpoints, mounted inside the authenticated admin router. */
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
