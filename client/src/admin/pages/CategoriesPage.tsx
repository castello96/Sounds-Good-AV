import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  createCategorySchema,
  departmentSchema,
  type CategorySummary,
  type CreateCategoryInput,
  type DepartmentInput,
  type DepartmentWithCategories,
} from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import { invalidateInventory, useCatalog } from "../inventory";

type DialogState =
  | { kind: "department"; department?: DepartmentWithCategories }
  | { kind: "category"; departmentId: number; category?: CategorySummary }
  | { kind: "deleteDepartment"; department: DepartmentWithCategories }
  | { kind: "deleteCategory"; category: CategorySummary }
  | null;

export default function CategoriesPage() {
  const { data: catalog, isLoading } = useCatalog();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  const remove = (url: string) =>
    api("DELETE", url)
      .then(invalidateInventory)
      .catch((error: Error) => toast({ title: "Couldn't delete", description: error.message, variant: "destructive" }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-muted-foreground">How equipment is grouped, by department.</p>
        </div>
        <Button onClick={() => setDialog({ kind: "department" })} data-testid="button-add-department">
          <Plus /> Add department
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {catalog?.length === 0 && (
        <p className="text-muted-foreground">No departments yet. Add one, like Audio or Lighting, to get started.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {catalog?.map((department) => (
          <Card key={department.id} data-testid={`card-department-${department.id}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{department.name}</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: "category", departmentId: department.id })}
                >
                  <Plus /> Category
                </Button>
                <RowMenu
                  label={`Actions for ${department.name}`}
                  onEdit={() => setDialog({ kind: "department", department })}
                  onDelete={() => setDialog({ kind: "deleteDepartment", department })}
                />
              </div>
            </CardHeader>
            <CardContent>
              {department.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                <ul className="divide-y">
                  {department.categories.map((category) => (
                    <li key={category.id} className="flex items-center justify-between py-1.5">
                      <span>{category.name}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {category.equipmentCount} {category.equipmentCount === 1 ? "item" : "items"}
                        <RowMenu
                          label={`Actions for ${category.name}`}
                          onEdit={() => setDialog({ kind: "category", departmentId: department.id, category })}
                          onDelete={() => setDialog({ kind: "deleteCategory", category })}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {dialog?.kind === "department" && <DepartmentDialog department={dialog.department} onClose={close} />}
      {dialog?.kind === "category" && catalog && (
        <CategoryDialog
          catalog={catalog}
          departmentId={dialog.departmentId}
          category={dialog.category}
          onClose={close}
        />
      )}
      {dialog?.kind === "deleteDepartment" && (
        <ConfirmDialog
          title={`Delete ${dialog.department.name}?`}
          description="Only empty departments can be deleted."
          confirmLabel="Delete"
          onConfirm={() => remove(`/api/admin/departments/${dialog.department.id}`)}
          onClose={close}
        />
      )}
      {dialog?.kind === "deleteCategory" && (
        <ConfirmDialog
          title={`Delete ${dialog.category.name}?`}
          description="Only categories with no equipment can be deleted."
          confirmLabel="Delete"
          onConfirm={() => remove(`/api/admin/categories/${dialog.category.id}`)}
          onClose={close}
        />
      )}
    </div>
  );
}

function RowMenu({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DepartmentDialog({ department, onClose }: { department?: DepartmentWithCategories; onClose: () => void }) {
  const form = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: department?.name ?? "" },
  });

  const onSubmit = (values: DepartmentInput) =>
    (department
      ? api("PATCH", `/api/admin/departments/${department.id}`, values)
      : api("POST", "/api/admin/departments", values)
    )
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError("name", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? "Edit department" : "Add department"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TextField control={form.control} name="name" label="Name" autoFocus />
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

function CategoryDialog({
  catalog,
  departmentId,
  category,
  onClose,
}: {
  catalog: DepartmentWithCategories[];
  departmentId: number;
  category?: CategorySummary;
  onClose: () => void;
}) {
  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { departmentId, name: category?.name ?? "" },
  });

  const onSubmit = (values: CreateCategoryInput) =>
    (category
      ? api("PATCH", `/api/admin/categories/${category.id}`, values)
      : api("POST", "/api/admin/categories", values)
    )
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError("name", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TextField control={form.control} name="name" label="Name" autoFocus />
            <SelectField
              control={form.control}
              name="departmentId"
              label="Department"
              numeric
              groups={[{ options: catalog.map((d) => ({ value: String(d.id), label: d.name })) }]}
            />
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
