import { useQuery } from "@tanstack/react-query";
import type { DepartmentWithCategories, EquipmentDetail, EquipmentSummary, InventoryStatus } from "@shared/inventory";
import { queryClient } from "@/lib/queryClient";
import { api } from "./api";
import type { SelectOptionGroup } from "./components/SelectField";

export const CATALOG_KEY = ["/api/admin/catalog"];
// Prefix shared by the list and every detail query.
export const EQUIPMENT_KEY = ["/api/admin/equipment"];

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api<DepartmentWithCategories[]>("GET", "/api/admin/catalog"),
  });
}

export function useEquipmentList() {
  return useQuery({
    queryKey: EQUIPMENT_KEY,
    queryFn: () => api<EquipmentSummary[]>("GET", "/api/admin/equipment"),
  });
}

export function useEquipment(id: number) {
  return useQuery({
    queryKey: [...EQUIPMENT_KEY, id],
    queryFn: () => api<EquipmentDetail>("GET", `/api/admin/equipment/${id}`),
  });
}

/**
 * Catalog names show up on equipment and equipment counts show up in the
 * catalog, so any inventory change refreshes both.
 */
export function invalidateInventory() {
  queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
  queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEY });
}

/** Categories grouped by department, for a category picker. */
export function categoryOptions(catalog: DepartmentWithCategories[] | undefined): SelectOptionGroup[] {
  return (catalog ?? [])
    .filter((d) => d.categories.length > 0)
    .map((d) => ({
      label: d.name,
      options: d.categories.map((c) => ({ value: String(c.id), label: c.name })),
    }));
}

export const equipmentName = (e: { brand: string; model: string }) => `${e.brand} ${e.model}`;

export const STATUS_BADGE: Record<InventoryStatus, "default" | "secondary" | "outline" | "destructive"> = {
  active: "secondary",
  maintenance: "default",
  retired: "outline",
  lost: "destructive",
};
