import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "wouter";
import type { z } from "zod";
import {
  EQUIPMENT_TRACKING,
  EQUIPMENT_TRACKING_LABELS,
  equipmentSchema,
  suggestSku,
  type EquipmentDetail,
} from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { api } from "../api";
import { categoryOptions, invalidateInventory, useCatalog, useEquipmentList } from "../inventory";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";

type FormInput = z.input<typeof equipmentSchema>;
type FormOutput = z.output<typeof equipmentSchema>;

const TRACKING_OPTIONS = [
  { options: EQUIPMENT_TRACKING.map((t) => ({ value: t, label: EQUIPMENT_TRACKING_LABELS[t] })) },
];

/** Adds equipment, or edits it when `equipment` is given. Calls onSaved with the result. */
export function EquipmentDialog({
  equipment,
  onClose,
  onSaved,
}: {
  equipment?: EquipmentDetail;
  onClose: () => void;
  onSaved?: (saved: EquipmentDetail) => void;
}) {
  const { data: catalog } = useCatalog();
  const { data: allEquipment } = useEquipmentList();
  const groups = categoryOptions(catalog);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: equipment
      ? {
          categoryId: equipment.categoryId,
          sku: equipment.sku,
          brand: equipment.brand,
          model: equipment.model,
          tracking: equipment.tracking,
          quantityOwned: equipment.quantityOwned,
        }
      : { sku: "", brand: "", model: "", tracking: "units", quantityOwned: 0 },
  });

  // Fill in the SKU from the category prefix and model until someone types one.
  // Existing equipment keeps its SKU unless edited by hand.
  const [categoryId, brand, model, tracking] = useWatch({
    control: form.control,
    name: ["categoryId", "brand", "model", "tracking"],
  });
  const prefix = catalog?.flatMap((d) => d.categories).find((c) => c.id === categoryId)?.tagPrefix;
  const takenSkus = useMemo(
    () => new Set((allEquipment ?? []).filter((e) => e.id !== equipment?.id).map((e) => e.sku)),
    [allEquipment, equipment],
  );
  useEffect(() => {
    if (equipment || !prefix || form.getFieldState("sku").isDirty) return;
    form.setValue("sku", suggestSku(prefix, brand ?? "", model ?? "", takenSkus));
  }, [equipment, prefix, brand, model, takenSkus, form]);

  const onSubmit = (values: FormOutput) =>
    (equipment
      ? api<EquipmentDetail>("PATCH", `/api/admin/equipment/${equipment.id}`, values)
      : api<EquipmentDetail>("POST", "/api/admin/equipment", values)
    )
      .then((saved) => {
        invalidateInventory();
        onSaved?.(saved);
        onClose();
      })
      .catch((error: Error) => form.setError(errorField(error.message), { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipment ? "Edit equipment" : "Add equipment"}</DialogTitle>
          <DialogDescription>A type of gear, like a Shure SM58.</DialogDescription>
        </DialogHeader>
        {catalog && groups.length === 0 ? (
          <p className="text-sm">
            Add a category first on the{" "}
            <Link href="/categories" className="underline" onClick={onClose}>
              Categories
            </Link>{" "}
            page.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <SelectField
                control={form.control}
                name="categoryId"
                label="Category"
                placeholder="Choose a category"
                numeric
                groups={groups}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextField control={form.control} name="brand" label="Brand" autoFocus={!equipment} />
                <TextField control={form.control} name="model" label="Model" />
              </div>
              <TextField
                control={form.control}
                name="sku"
                label="SKU"
                description={
                  equipment
                    ? "Shows on quotes. Best left alone once in use."
                    : "Filled in from the category and model. Change it if you like."
                }
              />
              <SelectField
                control={form.control}
                name="tracking"
                label="Tracking"
                description={
                  tracking === "quantity"
                    ? "For cheap, interchangeable gear like cables, where you only need a count."
                    : "Each physical item gets its own asset tag. Add units after saving."
                }
                groups={TRACKING_OPTIONS}
              />
              {tracking === "quantity" && (
                <TextField control={form.control} name="quantityOwned" label="Quantity owned" type="number" />
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {equipment ? "Save" : "Add equipment"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Puts a server error under the field it's about.
function errorField(message: string): keyof FormInput {
  if (message.includes("category")) return "categoryId";
  if (message.includes("tracking")) return "tracking";
  return "sku";
}
