import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, X, XCircle } from "lucide-react";
import { BOOKING_STATUS_LABELS, type BookingDetail, type BookingItem, type PackedUnit } from "@shared/bookings";
import { packUnitSchema, returnUnitSchema, type PackableUnit } from "@shared/packout";
import { formatRange } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { customerName, invalidateBookings, isOverdue, STATUS_BADGE, useBooking, usePackableUnits } from "../bookings";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { equipmentName, invalidateInventory } from "../inventory";

type Mode = "pack" | "return";
type Feedback = { ok: boolean; message: string } | null;
type Suggestion = { assetTag: string; name: string };
type TagBoxHandle = { fill: (assetTag: string) => void };

const MAX_SUGGESTIONS = 8;

/**
 * Packing gear out and checking it back in, laid out for a tablet in the
 * warehouse. Staff type each asset tag (a barcode scanner can type it later)
 * and press Enter, or pick it from the suggestions. On the Return tab, tapping
 * a unit that's still out fills in its tag. Gear tracked by quantity is
 * counted by hand.
 */
export default function PackPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: booking, isLoading, error } = useBooking(id);
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const [lostUnit, setLostUnit] = useState<PackedUnit | null>(null);
  const tagBox = useRef<TagBoxHandle>(null);
  const { data: packable } = usePackableUnits(id, booking?.status === "confirmed");
  const { toast } = useToast();

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (error || !booking) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">{error?.message ?? "Booking not found."}</p>
        <BackLink id={id} />
      </div>
    );
  }

  const live = booking.status === "confirmed";
  const quantity = sum(booking.items, (i) => i.quantity);
  const out = sum(booking.items, (i) => i.out);
  // Once everything is packed, the page opens on returns.
  const mode = chosenMode ?? (out > 0 && out >= quantity ? "return" : "pack");

  const run = (method: string, url: string, body: unknown, failure: string) =>
    api(method, url, body)
      .then(refresh)
      .catch((e: Error) => toast({ title: failure, description: e.message, variant: "destructive" }));

  return (
    <div className="space-y-6">
      <BackLink id={id} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{customerName(booking.customer)}</h1>
            <Badge variant={STATUS_BADGE[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
            {isOverdue(booking) && <Badge variant="destructive">Overdue</Badge>}
          </div>
          <p className="text-muted-foreground">
            Out and back {booking.outAt && booking.backAt ? formatRange(booking.outAt, booking.backAt) : "not set"}
          </p>
        </div>
        {live && out > 0 && <CompleteButton booking={booking} />}
      </div>

      {!live && (
        <Notice>
          This booking is {BOOKING_STATUS_LABELS[booking.status].toLowerCase()}. Gear can only be packed and checked in
          for confirmed bookings.
        </Notice>
      )}

      {live && (
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="h-12">
              <TabsTrigger value="pack" className="h-10 px-6 text-base" data-testid="tab-pack">
                Pack
              </TabsTrigger>
              <TabsTrigger value="return" className="h-10 px-6 text-base" data-testid="tab-return">
                Return
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <TagBox key={mode} ref={tagBox} mode={mode} booking={booking} suggestions={suggestionsFor(booking, mode, packable)} />
        </>
      )}

      <div className="space-y-2">
        <Progress value={progress(booking, mode)} className="h-3" />
        <p className="text-sm text-muted-foreground" data-testid="text-progress">
          {mode === "pack"
            ? `${out} of ${quantity} packed`
            : returnSummary({
                out,
                returned: sum(booking.items, (i) => i.returned),
                damaged: sum(booking.items, (i) => i.damaged),
                lost: sum(booking.items, (i) => i.lost),
              })}
        </p>
      </div>

      {booking.items.length === 0 ? (
        <p className="text-muted-foreground">No equipment on this booking.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {booking.items.map((item) => (
            <ItemCard
              key={item.equipmentId}
              booking={booking}
              item={item}
              mode={mode}
              live={live}
              onUnpack={(unit) =>
                run("DELETE", `/api/admin/bookings/${id}/units/${unit.id}`, undefined, `Couldn't unpack ${unit.assetTag}`)
              }
              onLost={setLostUnit}
              onPick={(unit) => tagBox.current?.fill(unit.assetTag)}
              onCounts={(counts) =>
                run("PATCH", `/api/admin/bookings/${id}/items/${item.equipmentId}/counts`, counts, "Couldn't save the counts")
              }
            />
          ))}
        </div>
      )}

      {lostUnit && (
        <ConfirmDialog
          title={`Mark ${lostUnit.assetTag} lost?`}
          description="It's taken out of service as lost. If it turns up, check it in on the Return tab."
          confirmLabel="Mark lost"
          onConfirm={() =>
            run("POST", `/api/admin/bookings/${id}/units/${lostUnit.id}/lost`, {}, `Couldn't mark ${lostUnit.assetTag} lost`)
          }
          onClose={() => setLostUnit(null)}
        />
      )}
    </div>
  );
}

/**
 * Tags to suggest: on the Return tab, units still out; when packing, free
 * units of gear that isn't fully packed yet.
 */
function suggestionsFor(booking: BookingDetail, mode: Mode, packable: PackableUnit[] | undefined): Suggestion[] {
  if (mode === "return") {
    return booking.items
      .flatMap((item) =>
        item.units
          .filter((u) => !u.returnedAt && !u.lostAt)
          .map((u) => ({ assetTag: u.assetTag, name: equipmentName(item) })),
      )
      .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  }
  const unpacked = new Map(
    booking.items.filter((i) => i.tracking === "units" && i.out < i.quantity).map((i) => [i.equipmentId, equipmentName(i)]),
  );
  return (packable ?? []).flatMap((u) => {
    const name = unpacked.get(u.equipmentId);
    return name ? [{ assetTag: u.assetTag, name }] : [];
  });
}

// Packing changes unit statuses too, which the inventory pages show.
function refresh() {
  invalidateBookings();
  invalidateInventory();
}

const sum = (items: BookingItem[], f: (i: BookingItem) => number) => items.reduce((n, i) => n + f(i), 0);

/** Like "5 of 6 back, 2 need repair, 1 lost". */
const returnSummary = (c: { out: number; returned: number; damaged: number; lost: number }) =>
  `${c.returned} of ${c.out} back` +
  (c.damaged > 0 ? `, ${c.damaged} ${c.damaged === 1 ? "needs" : "need"} repair` : "") +
  (c.lost > 0 ? `, ${c.lost} lost` : "");

type Counts = { out?: number; returned?: number; damaged?: number; lost?: number; notes?: string };

function progress(booking: BookingDetail, mode: Mode) {
  const out = sum(booking.items, (i) => i.out);
  if (mode === "pack") return (100 * out) / Math.max(1, sum(booking.items, (i) => i.quantity));
  return (100 * sum(booking.items, (i) => i.returned + i.lost)) / Math.max(1, out);
}

/** The big asset tag box. Enter submits and it's ready for the next tag straight away. */
const TagBox = forwardRef<TagBoxHandle, { mode: Mode; booking: BookingDetail; suggestions: Suggestion[] }>(function TagBox(
  { mode, booking, suggestions },
  ref,
) {
  const [tag, setTag] = useState("");
  const [needsRepair, setNeedsRepair] = useState(false);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // The highlighted suggestion. None until the arrow keys move, so a scanner's
  // Enter submits what it typed.
  const [active, setActive] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const focusAfterFill = useRef(false);

  useEffect(() => {
    // Selected, so after a mistake the next tag replaces it instead of adding on.
    if (!busy) input.current?.select();
  }, [busy]);

  useEffect(() => {
    // Waits for the render, since the button is disabled until there's a tag.
    if (!focusAfterFill.current) return;
    focusAfterFill.current = false;
    (mode === "return" ? notesBox.current : submitButton.current)?.focus({ preventScroll: true });
  }, [tag, mode]);

  const query = tag.trim().toUpperCase();
  const matches = suggestions
    .filter((s) => s.assetTag.includes(query) || s.name.toUpperCase().includes(query))
    .slice(0, MAX_SUGGESTIONS);
  const showList = listOpen && !busy && matches.length > 0;

  /** Fills in a tag, then moves on to the notes, or to Pack. */
  const fill = (assetTag: string) => {
    focusAfterFill.current = true;
    setTag(assetTag);
    setFeedback(null);
    setListOpen(false);
    setActive(-1);
    form.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  useImperativeHandle(ref, () => ({ fill }));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setListOpen(true);
      const last = matches.length - 1;
      setActive((i) => (e.key === "ArrowDown" ? Math.min(i + 1, last) : Math.max(i - 1, -1)));
    } else if (e.key === "Enter" && showList && matches[active]) {
      e.preventDefault();
      fill(matches[active].assetTag);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setListOpen(false);
      setActive(-1);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed =
      mode === "pack"
        ? packUnitSchema.safeParse({ assetTag: tag })
        : returnUnitSchema.safeParse({ assetTag: tag, notes, needsRepair });
    if (!parsed.success) return setFeedback({ ok: false, message: parsed.error.issues[0].message });
    const { assetTag } = parsed.data;

    setBusy(true);
    setListOpen(false);
    api<BookingDetail>("POST", `/api/admin/bookings/${booking.id}/${mode}`, parsed.data)
      .then((updated) => {
        refresh();
        const item = updated.items.find((i) => i.units.some((u) => u.assetTag === assetTag));
        const name = item ? equipmentName(item) : "";
        const message =
          mode === "pack"
            ? `Packed ${assetTag}${name && `, ${name}`}`
            : `${assetTag} is back${needsRepair ? " and sent to maintenance" : ""}`;
        setFeedback({ ok: true, message });
        setTag("");
        setNotes("");
        setNeedsRepair(false);
      })
      .catch((err: Error) => setFeedback({ ok: false, message: err.message }))
      .finally(() => setBusy(false));
  };

  return (
    <form ref={form} onSubmit={submit} className="scroll-mt-4 space-y-3 rounded-lg border p-4">
      <Label htmlFor="asset-tag" className="text-base">
        {mode === "pack" ? "Asset tag to pack" : "Asset tag coming back"}
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="asset-tag"
            ref={input}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setListOpen(true);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            // Tapping the box lists what's left. Focus alone doesn't, so the list
            // stays out of the way between scans.
            onClick={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            role="combobox"
            aria-expanded={showList}
            aria-controls="asset-tag-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={showList && matches[active] ? `suggestion-${matches[active].assetTag}` : undefined}
            placeholder="MIC-001"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
            className="h-14 font-mono text-2xl uppercase"
            data-testid="input-asset-tag"
          />
          {showList && (
            <ul
              id="asset-tag-suggestions"
              role="listbox"
              aria-label={mode === "pack" ? "Units you can pack" : "Units still out"}
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover p-1
                text-popover-foreground shadow-md"
              data-testid="list-tag-suggestions"
            >
              {matches.map((s, i) => (
                <li
                  key={s.assetTag}
                  id={`suggestion-${s.assetTag}`}
                  role="option"
                  aria-selected={i === active}
                  // Before the input's blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fill(s.assetTag)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-baseline gap-3 rounded-sm px-3 py-3",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                  data-testid={`option-tag-${s.assetTag}`}
                >
                  <span className="font-mono text-lg">{s.assetTag}</span>
                  <span className="truncate text-sm text-muted-foreground">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          ref={submitButton}
          type="submit"
          size="lg"
          className="h-14 px-8 text-base"
          disabled={busy || !tag.trim()}
          data-testid="button-submit-tag"
        >
          {mode === "pack" ? "Pack" : "Check in"}
        </Button>
      </div>
      {mode === "return" && (
        <div className="space-y-3">
          {suggestions.length > 0 && (
            <p className="text-sm text-muted-foreground">Or tap a tag on the gear below to fill it in.</p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={needsRepair}
              onCheckedChange={(v) => setNeedsRepair(v === true)}
              data-testid="checkbox-needs-repair"
            />
            Needs repair (send it to maintenance)
          </label>
          <Textarea
            ref={notesBox}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes on its condition, if any"
            rows={2}
            maxLength={2000}
            data-testid="input-return-notes"
          />
        </div>
      )}
      {feedback && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-md p-3 text-base font-medium",
            feedback.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
          data-testid="text-tag-feedback"
        >
          {feedback.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
          {feedback.message}
        </div>
      )}
    </form>
  );
});

function ItemCard({
  booking,
  item,
  mode,
  live,
  onUnpack,
  onLost,
  onPick,
  onCounts,
}: {
  booking: BookingDetail;
  item: BookingItem;
  mode: Mode;
  live: boolean;
  onUnpack: (unit: PackedUnit) => void;
  onLost: (unit: PackedUnit) => void;
  onPick: (unit: PackedUnit) => void;
  onCounts: (counts: Counts) => Promise<unknown>;
}) {
  const done = mode === "pack" ? item.out >= item.quantity : item.out > 0 && item.returned + item.lost >= item.out;
  const summary = mode === "pack" ? `${item.out} of ${item.quantity} packed` : returnSummary(item);

  return (
    <Card data-testid={`card-item-${item.equipmentId}`}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{equipmentName(item)}</CardTitle>
          <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
        </div>
        <span
          className={cn("flex items-center gap-1 text-sm", done ? "text-green-700 dark:text-green-400" : "text-muted-foreground")}
        >
          {done && <Check className="h-4 w-4" />}
          {summary}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.tracking === "quantity" ? (
          // Keyed on the saved counts, so the boxes reset after each save.
          <CountEditor
            key={`${booking.id}-${item.out}-${item.returned}-${item.damaged}-${item.lost}`}
            item={item}
            mode={mode}
            live={live}
            onSave={onCounts}
          />
        ) : item.units.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing packed yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {item.units.map((unit) => (
              <UnitChip
                key={unit.id}
                unit={unit}
                mode={mode}
                live={live}
                onUnpack={onUnpack}
                onLost={onLost}
                onPick={onPick}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnitChip({
  unit,
  mode,
  live,
  onUnpack,
  onLost,
  onPick,
}: {
  unit: PackedUnit;
  mode: Mode;
  live: boolean;
  onUnpack: (unit: PackedUnit) => void;
  onLost: (unit: PackedUnit) => void;
  onPick: (unit: PackedUnit) => void;
}) {
  const state = unit.returnedAt ? (unit.damaged ? "repair" : "back") : unit.lostAt ? "lost" : "out";
  const stillOut = state === "out";
  const pickable = live && stillOut && mode === "return";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 text-sm",
        live && stillOut ? "pr-1" : "pr-3",
        state === "back" && "border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-400",
        state === "repair" && "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        state === "lost" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
      title={unit.returnNotes ?? undefined}
      data-testid={`chip-unit-${unit.assetTag}`}
    >
      {state === "back" && <Check className="h-3.5 w-3.5" />}
      {pickable ? (
        <button
          type="button"
          onClick={() => onPick(unit)}
          className="rounded-full font-mono underline-offset-4 hover:underline focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Fill in ${unit.assetTag}`}
          data-testid={`button-pick-${unit.assetTag}`}
        >
          {unit.assetTag}
        </button>
      ) : (
        <span className="font-mono">{unit.assetTag}</span>
      )}
      {state === "repair" && <span className="text-xs">repair</span>}
      {state === "lost" && <span className="text-xs">lost</span>}
      {live && stillOut && mode === "pack" && (
        <button
          type="button"
          onClick={() => onUnpack(unit)}
          className="rounded-full p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Unpack ${unit.assetTag}`}
          data-testid={`button-unpack-${unit.assetTag}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {pickable && (
        <button
          type="button"
          onClick={() => onLost(unit)}
          className="rounded-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10 focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-lost-${unit.assetTag}`}
        >
          Mark lost
        </button>
      )}
    </div>
  );
}

/** Hand counts for gear tracked by quantity, like cables. */
function CountEditor({
  item,
  mode,
  live,
  onSave,
}: {
  item: BookingItem;
  mode: Mode;
  live: boolean;
  onSave: (counts: Counts) => Promise<unknown>;
}) {
  const [out, setOut] = useState(String(item.out));
  const [returned, setReturned] = useState(String(item.returned));
  const [damaged, setDamaged] = useState(String(item.damaged));
  const [lost, setLost] = useState(String(item.lost));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const fields: [string, string, (v: string) => void, number][] =
    mode === "pack"
      ? [["Out", out, setOut, item.quantity]]
      : [
          ["Back", returned, setReturned, item.out],
          // Out of the ones that came back.
          ["Repair", damaged, setDamaged, Number(returned)],
          ["Lost", lost, setLost, item.out],
        ];
  const changed =
    mode === "pack"
      ? out !== String(item.out)
      : returned !== String(item.returned) ||
        damaged !== String(item.damaged) ||
        lost !== String(item.lost) ||
        notes.trim() !== "";

  const save = () => {
    setSaving(true);
    const counts =
      mode === "pack"
        ? { out: Number(out) }
        : { returned: Number(returned), damaged: Number(damaged), lost: Number(lost), notes };
    onSave(counts).finally(() => setSaving(false));
  };

  if (mode === "return" && item.out === 0) return <p className="text-sm text-muted-foreground">None went out.</p>;
  const showNotes = mode === "return" && live && (Number(damaged) > 0 || Number(lost) > 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {fields.map(([label, value, set, max]) => (
          <div key={label} className="space-y-1">
            <Label htmlFor={`count-${item.equipmentId}-${label}`}>{label}</Label>
            <Input
              id={`count-${item.equipmentId}-${label}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={value}
              onChange={(e) => set(e.target.value)}
              disabled={!live || saving}
              className="h-11 w-24 text-lg"
              data-testid={`input-count-${label.toLowerCase()}-${item.equipmentId}`}
            />
          </div>
        ))}
        {live && (
          <Button
            variant="outline"
            className="h-11"
            disabled={!changed || saving}
            onClick={save}
            data-testid={`button-save-counts-${item.equipmentId}`}
          >
            Save
          </Button>
        )}
        {mode === "pack" && live && Number(out) !== item.quantity && (
          <Button variant="ghost" className="h-11" onClick={() => setOut(String(item.quantity))}>
            All {item.quantity}
          </Button>
        )}
      </div>
      {showNotes && (
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's wrong, or where it went missing (optional)"
          disabled={saving}
          aria-label="Repair or lost notes"
          data-testid={`input-count-notes-${item.equipmentId}`}
        />
      )}
    </div>
  );
}

/** Closes out the booking once all its gear is back or written off. */
function CompleteButton({ booking }: { booking: BookingDetail }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (booking.gearOut > 0) {
    return <p className="text-sm text-muted-foreground">{booking.gearOut} still out</p>;
  }
  const complete = () => {
    setBusy(true);
    api("POST", `/api/admin/bookings/${booking.id}/status`, { status: "completed" })
      .then(refresh)
      .catch((e: Error) => toast({ title: "Couldn't complete it", description: e.message, variant: "destructive" }))
      .finally(() => setBusy(false));
  };
  return (
    <Button size="lg" disabled={busy} onClick={complete} data-testid="button-complete">
      Mark completed
    </Button>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <p>{children}</p>
    </div>
  );
}

function BackLink({ id }: { id: number }) {
  return (
    <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Booking
    </Link>
  );
}
