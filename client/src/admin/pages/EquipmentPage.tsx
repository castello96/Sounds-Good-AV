import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import {
  COMPANY_BOUGHT,
  createUnitsSchema,
  EQUIPMENT_TRACKING_LABELS,
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUSES,
  MAX_BULK_UNITS,
  sequentialAssetTags,
  updateUnitSchema,
  type EquipmentDetail,
  type InventoryUnit,
} from "@shared/inventory";
import type { PublicUser } from "@shared/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EquipmentDialog } from "../components/EquipmentDialog";
import { OutOfServiceTable, ReportIssueDialog } from "../components/GearIssues";
import { SelectField } from "../components/SelectField";
import { TagBadges } from "../components/TagBadges";
import { TextareaField } from "../components/TextareaField";
import { TextField } from "../components/TextField";
import {
  availableCount,
  equipmentName,
  invalidateInventory,
  STATUS_BADGE,
  useEquipment,
  useOutOfService,
} from "../inventory";

const STATUS_OPTIONS = [{ options: INVENTORY_STATUSES.map((s) => ({ value: s, label: INVENTORY_STATUS_LABELS[s] })) }];

/**
 * Who a unit can be marked as brought in by: Company, then active staff. A
 * contributor who has since been deactivated stays listed on their own units.
 */
function useContributorOptions(current?: number | null) {
  const { data: users } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => api<PublicUser[]>("GET", "/api/admin/users"),
  });
  const staff = (users ?? []).filter((user) => user.isActive || user.id === current);
  return [
    { options: [{ value: String(COMPANY_BOUGHT), label: "Company (bought by the business)" }] },
    {
      label: "Staff",
      options: staff.map((user) => ({
        value: String(user.id),
        label: `${user.firstName} ${user.lastName}${user.isActive ? "" : " (inactive)"}`,
      })),
    },
  ];
}

type DialogState =
  | { kind: "edit" }
  | { kind: "delete" }
  | { kind: "addUnits" }
  | { kind: "report" }
  | { kind: "editUnit"; unit: InventoryUnit }
  | { kind: "deleteUnit"; unit: InventoryUnit }
  | null;

export default function EquipmentPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: equipment, isLoading, error } = useEquipment(id);
  const { data: outOfService } = useOutOfService();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (error || !equipment) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">{error?.message ?? "Equipment not found."}</p>
        <BackLink />
      </div>
    );
  }

  const remove = (url: string, after?: () => void) =>
    api("DELETE", url)
      .then(() => {
        invalidateInventory();
        after?.();
      })
      .catch((e: Error) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }));

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{equipmentName(equipment)}</h1>
          <p className="text-muted-foreground">
            <span className="font-mono">{equipment.sku}</span> · {equipment.departmentName} / {equipment.categoryName}
          </p>
          <p className="text-sm text-muted-foreground">Tracking: {EQUIPMENT_TRACKING_LABELS[equipment.tracking]}</p>
          <TagBadges tags={equipment.tags} className="mt-2" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ kind: "edit" })}>
            <Pencil /> Edit
          </Button>
          <Button variant="outline" onClick={() => setDialog({ kind: "delete" })}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      {equipment.tracking === "quantity" ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Quantity owned: <span data-testid="text-quantity-owned">{equipment.quantityOwned}</span>
              </h2>
              <p className="text-sm" data-testid="text-quantity-available">
                {availableCount(equipment)} available
                {equipment.issueCounts.repair > 0 && <>, {equipment.issueCounts.repair} in repair</>}
                {equipment.issueCounts.lost > 0 && <>, {equipment.issueCounts.lost} lost</>}
              </p>
              <p className="text-sm text-muted-foreground">
                This equipment is counted rather than tracked unit by unit, so there are no asset tags. Use Edit to
                change the quantity when you buy more. Report damaged or lost ones here so they can't be booked.
              </p>
            </div>
            <Button variant="outline" onClick={() => setDialog({ kind: "report" })} data-testid="button-report-issue">
              <AlertTriangle /> Report damaged or lost
            </Button>
          </div>
          {equipment.issueCounts.repair + equipment.issueCounts.lost > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">In repair or lost</h2>
              <OutOfServiceTable
                entries={outOfService?.filter((e) => e.equipmentId === equipment.id)}
                empty="Nothing is in repair or lost."
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">
              Units <span className="text-muted-foreground font-normal">({equipment.units.length})</span>
            </h2>
            <Button onClick={() => setDialog({ kind: "addUnits" })} data-testid="button-add-units">
              <Plus /> Add units
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset tag</TableHead>
                  <TableHead>Serial number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Brought in by</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipment.units.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No units yet. Add one for each physical item you own.
                    </TableCell>
                  </TableRow>
                )}
                {equipment.units.map((unit) => (
                  <TableRow key={unit.id} data-testid={`row-unit-${unit.id}`}>
                    <TableCell className="font-mono text-sm">{unit.assetTag}</TableCell>
                    <TableCell>{unit.serialNumber}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[unit.status]}>{INVENTORY_STATUS_LABELS[unit.status]}</Badge>
                    </TableCell>
                    <TableCell>{unit.condition}</TableCell>
                    <TableCell>{unit.purchasedAt}</TableCell>
                    <TableCell className={unit.contributorName ? undefined : "text-muted-foreground"}>
                      {unit.contributorName ?? "Company"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={unit.notes ?? undefined}>
                      {unit.notes}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${unit.assetTag}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ kind: "editUnit", unit })}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onSelect={() => setDialog({ kind: "deleteUnit", unit })}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {dialog?.kind === "edit" && <EquipmentDialog equipment={equipment} onClose={close} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${equipmentName(equipment)}?`}
          description="Only equipment with no units can be deleted. Delete or retire its units first."
          confirmLabel="Delete"
          onConfirm={() => remove(`/api/admin/equipment/${equipment.id}`, () => navigate("/inventory"))}
          onClose={close}
        />
      )}
      {dialog?.kind === "report" && <ReportIssueDialog equipment={equipment} onClose={close} />}
      {dialog?.kind === "addUnits" && <AddUnitsDialog equipment={equipment} onClose={close} />}
      {dialog?.kind === "editUnit" && <EditUnitDialog unit={dialog.unit} onClose={close} />}
      {dialog?.kind === "deleteUnit" && (
        <ConfirmDialog
          title={`Delete ${dialog.unit.assetTag}?`}
          description="Use this to fix mistakes. Units that have been on a booking can't be deleted; mark them retired or lost instead."
          confirmLabel="Delete"
          onConfirm={() => remove(`/api/admin/units/${dialog.unit.id}`)}
          onClose={close}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Inventory
    </Link>
  );
}

type CreateUnitsForm = z.input<typeof createUnitsSchema>;
type CreateUnitsValues = z.output<typeof createUnitsSchema>;

function AddUnitsDialog({ equipment, onClose }: { equipment: EquipmentDetail; onClose: () => void }) {
  const form = useForm<CreateUnitsForm, unknown, CreateUnitsValues>({
    resolver: zodResolver(createUnitsSchema),
    defaultValues: {
      assetTag: equipment.nextAssetTag ?? "",
      quantity: 1,
      status: "active",
      serialNumber: "",
      condition: "",
      purchasedAt: "",
      notes: "",
    },
  });
  const contributors = useContributorOptions();
  const [assetTag, quantity] = useWatch({ control: form.control, name: ["assetTag", "quantity"] });
  const count = Number(quantity);
  const preview = tagPreview(String(assetTag ?? "").trim().toUpperCase(), count);

  const onSubmit = (values: CreateUnitsValues) =>
    api<InventoryUnit[]>("POST", `/api/admin/equipment/${equipment.id}/units`, values)
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError(unitErrorField(error), { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add units</DialogTitle>
          <DialogDescription>
            Each unit is one physical {equipmentName(equipment)} with its own asset tag. The next free tag in this
            category is filled in. To add several at once, set a quantity and the number counts up.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-[1fr_7rem] gap-4">
              <TextField control={form.control} name="assetTag" label="Asset tag" autoFocus />
              <TextField control={form.control} name="quantity" label="Quantity" type="number" />
            </div>
            {preview && <p className="text-sm text-muted-foreground -mt-2">{preview}</p>}
            {count === 1 && <TextField control={form.control} name="serialNumber" label="Serial number" />}
            <div className="grid grid-cols-2 gap-4">
              <SelectField control={form.control} name="status" label="Status" groups={STATUS_OPTIONS} />
              <TextField control={form.control} name="purchasedAt" label="Purchased" type="date" />
            </div>
            <TextField control={form.control} name="condition" label="Condition" description="Like New, Good or Worn." />
            <SelectField
              control={form.control}
              name="contributedBy"
              label="Brought in by"
              placeholder="Choose"
              description={"Whose gear this was before it joined the rentals. Pick Company if the business bought it."}
              groups={contributors}
              numeric
            />
            <TextareaField control={form.control} name="notes" label="Notes" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {count > 1 && count <= MAX_BULK_UNITS ? `Add ${count} units` : "Add unit"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Which field a failed unit save should show its message on. */
function unitErrorField(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("serial")) return "serialNumber";
  if (message.includes("staff member")) return "contributedBy";
  return "assetTag";
}

/** "Creates MIC-001 to MIC-010" for a bulk add, or nothing when it can't tell yet. */
function tagPreview(start: string, count: number) {
  if (!start || !Number.isInteger(count) || count < 2 || count > MAX_BULK_UNITS || !/\d$/.test(start)) return null;
  const tags = sequentialAssetTags(start, count);
  return `Creates ${tags[0]} to ${tags[tags.length - 1]}`;
}

type UpdateUnitForm = z.input<typeof updateUnitSchema>;
type UpdateUnitValues = z.output<typeof updateUnitSchema>;

function EditUnitDialog({ unit, onClose }: { unit: InventoryUnit; onClose: () => void }) {
  const form = useForm<UpdateUnitForm, unknown, UpdateUnitValues>({
    resolver: zodResolver(updateUnitSchema),
    defaultValues: {
      assetTag: unit.assetTag,
      status: unit.status,
      serialNumber: unit.serialNumber ?? "",
      condition: unit.condition ?? "",
      purchasedAt: unit.purchasedAt ?? "",
      notes: unit.notes ?? "",
      contributedBy: unit.contributedBy ?? COMPANY_BOUGHT,
    },
  });
  const contributors = useContributorOptions(unit.contributedBy);

  const onSubmit = (values: UpdateUnitValues) =>
    api("PATCH", `/api/admin/units/${unit.id}`, values)
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError(unitErrorField(error), { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {unit.assetTag}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="assetTag" label="Asset tag" />
              <TextField control={form.control} name="serialNumber" label="Serial number" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField control={form.control} name="status" label="Status" groups={STATUS_OPTIONS} />
              <TextField control={form.control} name="purchasedAt" label="Purchased" type="date" />
            </div>
            <TextField control={form.control} name="condition" label="Condition" />
            <SelectField
              control={form.control}
              name="contributedBy"
              label="Brought in by"
              groups={contributors}
              numeric
            />
            <TextareaField control={form.control} name="notes" label="Notes" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
