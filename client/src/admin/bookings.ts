import { useQuery } from "@tanstack/react-query";
import type {
  Availability,
  BookingCounts,
  BookingDetail,
  BookingStatus,
  BookingSummary,
  CustomerSummary,
} from "@shared/bookings";
import { queryClient } from "@/lib/queryClient";
import { api } from "./api";

// Prefix shared by the lists, counts, details and availability.
export const BOOKINGS_KEY = ["/api/admin/bookings"];

export function useBookings(status?: BookingStatus) {
  return useQuery({
    queryKey: [...BOOKINGS_KEY, "list", status ?? "all"],
    queryFn: () => api<BookingSummary[]>("GET", `/api/admin/bookings${status ? `?status=${status}` : ""}`),
  });
}

export function useBookingCounts() {
  return useQuery({
    queryKey: [...BOOKINGS_KEY, "counts"],
    queryFn: () => api<BookingCounts>("GET", "/api/admin/bookings/counts"),
  });
}

/** Confirmed bookings with gear still out. */
export function useOutNow() {
  return useQuery({
    queryKey: [...BOOKINGS_KEY, "out"],
    queryFn: () => api<BookingSummary[]>("GET", "/api/admin/bookings/out"),
  });
}

export function useBooking(id: number) {
  return useQuery({
    queryKey: [...BOOKINGS_KEY, id],
    queryFn: () => api<BookingDetail>("GET", `/api/admin/bookings/${id}`),
  });
}

export function useBookingAvailability(id: number, enabled: boolean) {
  return useQuery({
    queryKey: [...BOOKINGS_KEY, id, "availability"],
    queryFn: () => api<Availability[]>("GET", `/api/admin/bookings/${id}/availability`),
    enabled,
  });
}

export function useCustomerSearch(search: string) {
  return useQuery({
    queryKey: ["/api/admin/customers", search],
    queryFn: () => api<CustomerSummary[]>("GET", `/api/admin/customers?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });
}

/** A booking change can move counts, lists and other bookings' availability, so refresh them all. */
export function invalidateBookings() {
  queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
}

export const STATUS_BADGE: Record<BookingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  inquiry: "default",
  quoted: "secondary",
  confirmed: "secondary",
  completed: "outline",
  cancelled: "outline",
};

/** Gear is still out past the time it was due back. */
export const isOverdue = (b: BookingSummary) => b.gearOut > 0 && b.backAt !== null && new Date(b.backAt) < new Date();

export const customerName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;
