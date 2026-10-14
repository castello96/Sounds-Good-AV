import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Search, Wrench } from "lucide-react";
import type { EquipmentSummary } from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EquipmentDialog } from "../components/EquipmentDialog";
import { TagBadges } from "../components/TagBadges";
import { availableCount, equipmentName, outOfServiceCount, useCatalog, useEquipmentList, useTags } from "../inventory";

const ALL = "all";

export default function InventoryPage() {
  const { data: equipment, isLoading } = useEquipmentList();
  const { data: catalog } = useCatalog();
  const { data: tags } = useTags();
  const [, navigate] = useLocation();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);

  const visible = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (equipment ?? []).filter(
      (e) =>
        (departmentId === ALL || String(e.departmentId) === departmentId) &&
        (tagId === ALL || e.tags.some((t) => String(t.id) === tagId)) &&
        terms.every((term) => searchText(e).includes(term)),
    );
  }, [equipment, search, departmentId, tagId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-muted-foreground">The gear you rent out, and the units you own of each.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/lost-and-repair" data-testid="link-lost-and-repair">
              <Wrench /> Lost and repair
            </Link>
          </Button>
          <Button onClick={() => setAdding(true)} data-testid="button-add-equipment">
            <Plus /> Add equipment
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, model, SKU, category or tag"
            className="pl-8"
            data-testid="input-search"
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="sm:w-48" aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {catalog?.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!!tags?.length && (
          <Select value={tagId} onValueChange={setTagId}>
            <SelectTrigger className="sm:w-48" aria-label="Tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipment</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Out of service</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || visible.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {isLoading
                    ? "Loading..."
                    : equipment?.length
                      ? "Nothing matches your search."
                      : "No equipment yet. Add your first item to start building the catalog."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((e) => (
              <TableRow
                key={e.id}
                className="cursor-pointer"
                onClick={() => navigate(`/inventory/${e.id}`)}
                data-testid={`row-equipment-${e.id}`}
              >
                <TableCell className="font-medium">
                  <Link href={`/inventory/${e.id}`} onClick={(event) => event.stopPropagation()}>
                    {equipmentName(e)}
                  </Link>
                  <TagBadges tags={e.tags} className="mt-1" />
                </TableCell>
                <TableCell className="font-mono text-sm">{e.sku}</TableCell>
                <TableCell>
                  {e.departmentName} <span className="text-muted-foreground">/</span> {e.categoryName}
                </TableCell>
                <TableCell className="text-right">
                  {availableCount(e)}
                  {e.tracking === "quantity" && <span className="text-muted-foreground"> (qty)</span>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {outOfServiceCount(e) || ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {adding && (
        <EquipmentDialog onClose={() => setAdding(false)} onSaved={(saved) => navigate(`/inventory/${saved.id}`)} />
      )}
    </div>
  );
}

const searchText = (e: EquipmentSummary) =>
  [e.brand, e.model, e.sku, e.categoryName, e.departmentName, ...e.tags.map((t) => t.name)].join(" ").toLowerCase();
