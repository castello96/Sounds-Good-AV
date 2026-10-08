import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { equipmentSchema, type EquipmentDetail, type EquipmentInput } from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { api } from "../api";
import { categoryOptions, invalidateInventory, useCatalog } from "../inventory";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";

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
  const groups = categoryOptions(catalog);
  const form = useForm<EquipmentInput>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: equipment
      ? { categoryId: equipment.categoryId, sku: equipment.sku, brand: equipment.brand, model: equipment.model }
      : { sku: "", brand: "", model: "" },
  });

  const onSubmit = (values: EquipmentInput) =>
    (equipment
      ? api<EquipmentDetail>("PATCH", `/api/admin/equipment/${equipment.id}`, values)
      : api<EquipmentDetail>("POST", "/api/admin/equipment", values)
    )
      .then((saved) => {
        invalidateInventory();
        onSaved?.(saved);
        onClose();
      })
      .catch((error: Error) =>
        // Only the SKU and category can clash or go missing on the server.
        form.setError(error.message.includes("category") ? "categoryId" : "sku", { message: error.message }),
      );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{equipment ? "Edit equipment" : "Add equipment"}</DialogTitle>
          <DialogDescription>
            A type of gear, like a Shure SM58. Add the individual units you own after saving.
          </DialogDescription>
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
              <div className="grid grid-cols-2 gap-4">
                <TextField control={form.control} name="brand" label="Brand" autoFocus />
                <TextField control={form.control} name="model" label="Model" />
              </div>
              <TextField
                control={form.control}
                name="sku"
                label="SKU"
                description="Your short code for this item, like SM58. Must be unique."
              />
              <SelectField
                control={form.control}
                name="categoryId"
                label="Category"
                placeholder="Choose a category"
                numeric
                groups={groups}
              />
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
