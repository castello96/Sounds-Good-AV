import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@shared/bookings";
import type { Payment } from "@shared/payments";
import { paymentProgress, progressSteps, type Milestones } from "@shared/progress";

const at = { at: "2027-03-01T15:00:00.000Z", actor: "Staff Member" };

function booking(status: BookingStatus, items: Partial<Record<"quantity" | "out" | "returned" | "lost" | "damaged", number>>[] = []) {
  const full = items.map((i) => ({ quantity: 1, out: 0, returned: 0, lost: 0, damaged: 0, ...i }));
  return {
    status,
    items: full,
    gearOut: full.reduce((sum, i) => sum + i.out - i.returned - i.lost, 0),
    totalPriceCents: 40000,
    paidCents: 0,
  };
}

const states = (b: ReturnType<typeof booking>, m: Milestones = {}) =>
  Object.fromEntries(progressSteps(b, m).map((s) => [s.key, s.state]));

describe("booking tracker", () => {
  it("starts with quoting up next", () => {
    expect(states(booking("inquiry", [{}]), { created: at })).toEqual({
      inquiry: "done",
      quoted: "next",
      confirmed: "todo",
      out: "todo",
      back: "todo",
      completed: "todo",
    });
  });

  it("marks quoting skipped for a phone deal confirmed straight away", () => {
    const steps = progressSteps(booking("confirmed", [{ quantity: 5 }]), { created: at, confirmed: at });
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ["inquiry", "done"],
      ["quoted", "skipped"],
      ["confirmed", "done"],
      ["out", "next"],
      ["back", "todo"],
      ["completed", "todo"],
    ]);
    expect(steps[2].milestone).toEqual(at);
  });

  it("shows packing and returns underway", () => {
    const packing = progressSteps(booking("confirmed", [{ quantity: 5, out: 3 }]), { quoted: at, confirmed: at });
    expect(packing.find((s) => s.key === "out")).toMatchObject({ state: "active", note: "3 of 5 packed" });
    expect(packing.find((s) => s.key === "back")?.state).toBe("todo");

    const returning = progressSteps(booking("confirmed", [{ quantity: 5, out: 5, returned: 2 }]), { quoted: at, confirmed: at });
    expect(returning.find((s) => s.key === "out")?.state).toBe("done");
    expect(returning.find((s) => s.key === "back")).toMatchObject({ state: "active", note: "2 of 5 back" });
  });

  it("is ready to complete once everything is back, noting repairs and losses", () => {
    const steps = progressSteps(booking("confirmed", [{ quantity: 5, out: 5, returned: 4, lost: 1, damaged: 2 }]), {
      quoted: at,
      confirmed: at,
    });
    expect(steps.find((s) => s.key === "back")).toMatchObject({ state: "done", note: "2 need repair, 1 lost" });
    expect(steps.find((s) => s.key === "completed")?.state).toBe("next");
  });

  it("warns about money still owed on a completed booking", () => {
    const b = { ...booking("completed", [{ out: 1, returned: 1 }]), paidCents: 20000 };
    const done = progressSteps(b, { quoted: at, confirmed: at });
    expect(done.every((s) => s.state === "done")).toBe(true);
    expect(done[done.length - 1].warning).toBe("$200.00 still owed");
  });

  it("leaves out gear steps for a booking with no gear, and skips them when nothing was packed", () => {
    expect(Object.keys(states(booking("quoted"), { quoted: at }))).toEqual(["inquiry", "quoted", "confirmed", "completed"]);
    expect(states(booking("completed", [{}]), { quoted: at, confirmed: at })).toMatchObject({ out: "skipped", back: "skipped" });
  });

  it("ends a cancelled booking where it stopped", () => {
    expect(states(booking("cancelled", [{}]), { quoted: at, cancelled: at })).toEqual({
      inquiry: "done",
      quoted: "done",
      confirmed: "skipped",
      out: "skipped",
      back: "skipped",
      cancelled: "cancelled",
    });
  });
});

let nextId = 0;
const payment = (kind: Payment["kind"], dollars: number): Payment => ({
  id: ++nextId,
  kind,
  amountCents: dollars * 100,
  method: "check",
  reference: null,
  paidAt: "2027-03-01T05:00:00.000Z",
  notes: null,
  createdAt: "2027-03-01T15:00:00.000Z",
});

function progress(total: number | null, payments: Payment[], status: BookingStatus = "confirmed") {
  const paidCents = payments.reduce((sum, p) => sum + (p.kind === "refund" ? -p.amountCents : p.amountCents), 0);
  return paymentProgress({ status, totalPriceCents: total === null ? null : total * 100, paidCents, payments });
}

const percents = (p: ReturnType<typeof progress>) => p.segments.map((s) => s.percent);

describe("payment bar", () => {
  it("fills by the share paid, one piece per payment", () => {
    expect(progress(400, [])).toMatchObject({ state: "unpaid", detail: "$0.00 of $400.00", segments: [] });
    const deposit = progress(400, [payment("payment", 100)]);
    expect(deposit).toMatchObject({ state: "deposit", label: "Deposit paid", detail: "$100.00 of $400.00, $300.00 to go" });
    expect(percents(deposit)).toEqual([25]);
    const full = progress(400, [payment("payment", 100), payment("payment", 300)]);
    expect(full.state).toBe("paid");
    expect(percents(full)).toEqual([25, 75]);
  });

  it("takes refunds off the newest payments", () => {
    const p = progress(400, [payment("payment", 100), payment("payment", 300), payment("refund", 350)]);
    expect(p.segments.map((s) => s.keptCents)).toEqual([5000]);
    expect(p.detail).toBe("$50.00 of $400.00, $350.00 to go, after $350.00 refunded");
  });

  it("scales an overpaid bar to what was paid", () => {
    const p = progress(400, [payment("payment", 400), payment("payment", 100)]);
    expect(p).toMatchObject({ state: "overpaid", detail: "$500.00 paid on $400.00. Refund $100.00" });
    expect(percents(p)).toEqual([80, 20]);
  });

  it("handles unpriced and cancelled bookings", () => {
    expect(progress(null, [payment("payment", 50)])).toMatchObject({ state: "unpriced", label: "Not priced" });
    expect(progress(400, [payment("payment", 100)], "cancelled")).toMatchObject({ state: "cancelled", detail: "$100.00 kept" });
  });
});
