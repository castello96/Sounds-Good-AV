import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import {
  createUnitsSchema,
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUSES,
  MAX_BULK_UNITS,
  sequentialAssetTags,
  updateUnitSchema,
  type EquipmentDetail,
  type InventoryUnit,
} from "@shared/inventory";
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
import { SelectField } from "../components/SelectField";
import { TextareaField } from "../components/TextareaField";
import { TextField } from "../components/TextField";
import { equipmentName, invalidateInventory, STATUS_BADGE, useEquipment } from "../inventory";

const STATUS_OPTIONS = [{ options: INVENTORY_STATUSES.map((s) => ({ value: s, label: INVENTORY_STATUS_LABELS[s] })) }];

type DialogState =
  | { kind: "edit" }
  | { kind: "delete" }
  | { kind: "addUnits" }
  | { kind: "editUnit"; unit: InventoryUnit }
  | { kind: "deleteUnit"; unit: InventoryUnit }
  | null;

export default function EquipmentPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: equipment, isLoading, error } = useEquipment(id);
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
              <TableHead>Notes</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipment.units.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
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
      assetTag: "",
      quantity: 1,
      status: "active",
      serialNumber: "",
      condition: "",
      purchasedAt: "",
      notes: "",
    },
  });
  const [assetTag, quantity] = useWatch({ control: form.control, name: ["assetTag", "quantity"] });
  const count = Number(quantity);
  const preview = tagPreview(String(assetTag ?? "").trim().toUpperCase(), count);

  const onSubmit = (values: CreateUnitsValues) =>
    api<InventoryUnit[]>("POST", `/api/admin/equipment/${equipment.id}/units`, values)
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError("assetTag", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add units</DialogTitle>
          <DialogDescription>
            Each unit is one physical {equipmentName(equipment)} with its own asset tag. To add several at once, end
            the tag with a number and it counts up.
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
    },
  });

  const onSubmit = (values: UpdateUnitValues) =>
    api("PATCH", `/api/admin/units/${unit.id}`, values)
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) =>
        form.setError(error.message.toLowerCase().includes("serial") ? "serialNumber" : "assetTag", {
          message: error.message,
        }),
      );

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
