import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MoreHorizontal, Plus } from "lucide-react";
import { tagSchema, type TagInput, type TagSummary } from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TextField } from "../components/TextField";
import { invalidateInventory, useTags } from "../inventory";

type DialogState = { kind: "edit"; tag?: TagSummary } | { kind: "delete"; tag: TagSummary } | null;

const items = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"} of equipment`;

export default function TagsPage() {
  const { data: tags, isLoading } = useTags();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  const remove = (tag: TagSummary) =>
    api("DELETE", `/api/admin/tags/${tag.id}`)
      .then(invalidateInventory)
      .catch((error: Error) => toast({ title: "Couldn't delete", description: error.message, variant: "destructive" }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-muted-foreground">
            Labels for what gear is used for, like Live Sound or Podcasting. Add them to equipment to search by them.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "edit" })} data-testid="button-add-tag">
          <Plus /> Add tag
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Used on</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || tags?.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  {isLoading ? "Loading..." : "No tags yet. Add one, like Live Sound, to start labeling equipment."}
                </TableCell>
              </TableRow>
            )}
            {tags?.map((tag) => (
              <TableRow key={tag.id} data-testid={`row-tag-${tag.id}`}>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {tag.equipmentCount ? items(tag.equipmentCount) : "Not used yet"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${tag.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", tag })}>Rename</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onSelect={() => setDialog({ kind: "delete", tag })}>
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

      {dialog?.kind === "edit" && <TagDialog tag={dialog.tag} onClose={close} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.tag.name}?`}
          description={
            dialog.tag.equipmentCount
              ? `It will be taken off ${items(dialog.tag.equipmentCount)}. The equipment itself isn't changed.`
              : "It isn't on any equipment."
          }
          confirmLabel="Delete"
          onConfirm={() => remove(dialog.tag)}
          onClose={close}
        />
      )}
    </div>
  );
}

function TagDialog({ tag, onClose }: { tag?: TagSummary; onClose: () => void }) {
  const form = useForm<TagInput>({ resolver: zodResolver(tagSchema), defaultValues: { name: tag?.name ?? "" } });

  const onSubmit = (values: TagInput) =>
    (tag ? api("PATCH", `/api/admin/tags/${tag.id}`, values) : api("POST", "/api/admin/tags", values))
      .then(() => {
        invalidateInventory();
        onClose();
      })
      .catch((error: Error) => form.setError("name", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tag ? "Rename tag" : "Add tag"}</DialogTitle>
          {tag && !!tag.equipmentCount && (
            <DialogDescription>The new name shows on all {items(tag.equipmentCount)} with this tag.</DialogDescription>
          )}
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
