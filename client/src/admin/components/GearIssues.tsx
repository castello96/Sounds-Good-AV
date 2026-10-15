import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import {
  GEAR_ISSUE_KIND_LABELS,
  GEAR_ISSUE_KINDS,
  GEAR_RESOLUTION_LABELS,
  reportIssueSchema,
  resolveIssueSchema,
  RESOLUTIONS_BY_KIND,
  type GearResolution,
  type OutOfServiceEntry,
  type ReportIssueData,
  type ReportIssueInput,
  type ResolveIssueData,
  type ResolveIssueInput,
} from "@shared/gearIssues";
import type { EquipmentSummary } from "@shared/inventory";
import { formatDate } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "../api";
import { invalidateBookings } from "../bookings";
import { equipmentName, invalidateInventory } from "../inventory";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

const KIND_OPTIONS = [{ options: GEAR_ISSUE_KINDS.map((k) => ({ value: k, label: k === "repair" ? "Damaged" : "Lost" })) }];

// Stock and booking availability both change when gear goes out of service or comes back.
const refresh = () => {
  invalidateInventory();
  invalidateBookings();
};

/**
 * Gear in repair or lost, with buttons to settle each line. Pass `showEquipment`
 * to name the equipment on each line.
 */
export function OutOfServiceTable({
  entries,
  showEquipment,
  empty,
}: {
  entries: OutOfServiceEntry[] | undefined;
  showEquipment?: boolean;
  empty: string;
}) {
  const [settling, setSettling] = useState<{ entry: OutOfServiceEntry; resolution: GearResolution } | null>(null);
  const columns = showEquipment ? 6 : 5;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            {showEquipment && <TableHead>Equipment</TableHead>}
            <TableHead>Tag or count</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Settle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(!entries || entries.length === 0) && (
            <TableRow>
              <TableCell colSpan={columns} className="text-muted-foreground">
                {entries ? empty : "Loading..."}
              </TableCell>
            </TableRow>
          )}
          {entries?.map((entry) => (
            <TableRow key={entry.key} data-testid={`row-issue-${entry.key}`}>
              <TableCell>
                <Badge variant={entry.kind === "lost" ? "destructive" : "default"}>
                  {GEAR_ISSUE_KIND_LABELS[entry.kind]}
                </Badge>
              </TableCell>
              {showEquipment && (
                <TableCell className="font-medium">
                  <Link href={`/inventory/${entry.equipmentId}`}>{equipmentName(entry)}</Link>
                  <div className="font-mono text-xs text-muted-foreground">{entry.sku}</div>
                </TableCell>
              )}
              <TableCell className={entry.unit ? "font-mono text-sm" : "tabular-nums"}>
                {entry.unit ? entry.unit.assetTag : entry.quantity}
              </TableCell>
              <TableCell>
                {entry.booking ? (
                  <Link href={`/bookings/${entry.booking.id}`}>{entry.booking.customerName}</Link>
                ) : (
                  <span className="text-muted-foreground">{entry.unit ? "Set by hand" : "Reported"}</span>
                )}
                <div className="text-xs text-muted-foreground">{formatDate(entry.since)}</div>
              </TableCell>
              <TableCell className="max-w-64 truncate" title={entry.notes ?? undefined}>
                {entry.notes}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {RESOLUTIONS_BY_KIND[entry.kind].map((resolution) => (
                    <Button
                      key={resolution}
                      size="sm"
                      variant={resolution === "written_off" ? "ghost" : "outline"}
                      onClick={() => setSettling({ entry, resolution })}
                      data-testid={`button-${resolution}-${entry.key}`}
                    >
                      {GEAR_RESOLUTION_LABELS[resolution]}
                    </Button>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {settling && <ResolveDialog {...settling} onClose={() => setSettling(null)} />}
    </div>
  );
}

const RESOLUTION_HINTS: Record<GearResolution, string> = {
  repaired: "goes back in stock and can be booked again.",
  found: "goes back in stock and can be booked again.",
  written_off: "comes off the owned count for good.",
};

/** Settles a line: some or all of a count, or one unit. */
function ResolveDialog({
  entry,
  resolution,
  onClose,
}: {
  entry: OutOfServiceEntry;
  resolution: GearResolution;
  onClose: () => void;
}) {
  const form = useForm<ResolveIssueInput, unknown, ResolveIssueData>({
    resolver: zodResolver(resolveIssueSchema),
    defaultValues: { resolution, quantity: entry.quantity },
  });

  const onSubmit = (data: ResolveIssueData) =>
    api(
      "POST",
      entry.unit ? `/api/admin/units/${entry.unit.id}/resolve` : `/api/admin/issues/${entry.issueId}/resolve`,
      entry.unit ? { resolution } : data,
    )
      .then(() => {
        refresh();
        onClose();
      })
      .catch((error: Error) => form.setError("root", { message: error.message }));

  const name = equipmentName(entry);
  const what = entry.unit
    ? `${entry.unit.assetTag} (${name})`
    : entry.quantity === 1
      ? `The ${name}`
      : `Each ${name} you settle`;
  const hint =
    entry.unit && resolution === "written_off"
      ? `${entry.unit.assetTag} (${name}) is retired and can't be booked again.`
      : `${what} ${RESOLUTION_HINTS[resolution]}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {resolution === "written_off" ? "Write off" : `Mark ${GEAR_RESOLUTION_LABELS[resolution].toLowerCase()}`}:{" "}
            {entry.unit ? entry.unit.assetTag : name}
          </DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!entry.unit && entry.quantity > 1 && (
              <TextField
                control={form.control}
                name="quantity"
                label="How many"
                type="number"
                description={`Out of ${entry.quantity}. The rest stay on the list.`}
                autoFocus
              />
            )}
            {form.formState.errors.root && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={resolution === "written_off" ? "destructive" : "default"}
                disabled={form.formState.isSubmitting}
                data-testid="button-confirm-resolve"
              >
                {GEAR_RESOLUTION_LABELS[resolution]}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Reports some of a piece of gear tracked by quantity as damaged or lost, outside of a booking. */
export function ReportIssueDialog({ equipment, onClose }: { equipment: EquipmentSummary; onClose: () => void }) {
  const form = useForm<ReportIssueInput, unknown, ReportIssueData>({
    resolver: zodResolver(reportIssueSchema),
    defaultValues: { kind: "repair", quantity: 1, notes: "" },
  });

  const onSubmit = () =>
    api("POST", `/api/admin/equipment/${equipment.id}/issues`, form.getValues())
      .then(() => {
        refresh();
        onClose();
      })
      .catch((error: Error) => form.setError("root", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report damaged or lost</DialogTitle>
          <DialogDescription>
            They stay owned but can't be booked until they're repaired, found or written off in Lost and repair.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField control={form.control} name="kind" label="What happened" groups={KIND_OPTIONS} />
              <TextField control={form.control} name="quantity" label="How many" type="number" autoFocus />
            </div>
            <TextareaField control={form.control} name="notes" label="Notes" />
            {form.formState.errors.root && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-issue">
                Report
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
