import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  createUserSchema,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  type CreateUserInput,
  type PublicUser,
  type ResetPasswordInput,
  type UpdateUserInput,
} from "@shared/users";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "../api";
import { TextField } from "../components/TextField";
import { useCurrentUser } from "../useAuth";

const USERS_KEY = ["/api/admin/users"];
const detailsSchema = createUserSchema.omit({ password: true });
type DetailsInput = Omit<CreateUserInput, "password">;

// Which dialog is open, and for whom.
type DialogState =
  | { kind: "add" }
  | { kind: "edit"; user: PublicUser }
  | { kind: "password"; user: PublicUser }
  | { kind: "deactivate"; user: PublicUser }
  | null;

export default function StaffPage() {
  const { data: me } = useCurrentUser();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  const { data: users, isLoading } = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => api<PublicUser[]>("GET", "/api/admin/users"),
  });

  const update = useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: number }) =>
      api<PublicUser>("PATCH", `/api/admin/users/${id}`, input),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      // Keep the sidebar name current when editing yourself.
      if (user.id === me?.id) queryClient.setQueryData(["/api/auth/me"], user);
    },
  });
  const setActive = (user: PublicUser, isActive: boolean) =>
    update.mutate(
      { id: user.id, isActive },
      { onError: (error) => toast({ title: "Couldn't update staff member", description: error.message, variant: "destructive" }) },
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-muted-foreground">Everyone here can log in to the staff portal.</p>
        </div>
        <Button onClick={() => setDialog({ kind: "add" })} data-testid="button-add-staff">
          <Plus /> Add staff
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {users?.map((user) => (
              <TableRow key={user.id} data-testid={`row-staff-${user.id}`}>
                <TableCell className="font-medium">
                  {user.firstName} {user.lastName}
                  {user.id === me?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Deactivated</Badge>}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${user.firstName}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", user })}>Edit details</DropdownMenuItem>
                      {user.id !== me?.id && (
                        <DropdownMenuItem onSelect={() => setDialog({ kind: "password", user })}>
                          Reset password
                        </DropdownMenuItem>
                      )}
                      {user.id !== me?.id &&
                        (user.isActive ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => setDialog({ kind: "deactivate", user })}
                          >
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => setActive(user, true)}>
                            Reactivate
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialog?.kind === "add" && <AddStaffDialog onClose={close} />}
      {dialog?.kind === "edit" && (
        <EditStaffDialog
          user={dialog.user}
          onClose={close}
          onSave={(input) => update.mutateAsync({ id: dialog.user.id, ...input }).then(close)}
        />
      )}
      {dialog?.kind === "password" && <ResetPasswordDialog user={dialog.user} onClose={close} />}
      <AlertDialog open={dialog?.kind === "deactivate"} onOpenChange={(open) => !open && close()}>
        {dialog?.kind === "deactivate" && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {dialog.user.firstName}?</AlertDialogTitle>
              <AlertDialogDescription>
                They'll be logged out right away and won't be able to log in. Their history stays, and you can
                reactivate them later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => setActive(dialog.user, false)}
              >
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => api<PublicUser>("POST", "/api/admin/users", input),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast({ title: `Added ${user.firstName}`, description: "Share the password with them so they can log in." });
      onClose();
    },
    onError: (error) => form.setError("email", { message: error.message }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>They can change their password from the Account page after logging in.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="firstName" label="First name" autoFocus />
              <TextField control={form.control} name="lastName" label="Last name" />
            </div>
            <TextField control={form.control} name="email" label="Email" type="email" autoComplete="off" />
            <TextField
              control={form.control}
              name="password"
              label="Initial password"
              type="password"
              autoComplete="new-password"
              description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding..." : "Add staff"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  user,
  onClose,
  onSave,
}: {
  user: PublicUser;
  onClose: () => void;
  onSave: (input: DetailsInput) => Promise<unknown>;
}) {
  const form = useForm<DetailsInput>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, email: user.email },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) =>
              onSave(v).catch((error: Error) => form.setError("email", { message: error.message })),
            )} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="firstName" label="First name" />
              <TextField control={form.control} name="lastName" label="Last name" />
            </div>
            <TextField control={form.control} name="email" label="Email" type="email" autoComplete="off" />
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

function ResetPasswordDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  const reset = useMutation({
    mutationFn: (input: ResetPasswordInput) => api("POST", `/api/admin/users/${user.id}/password`, input),
    onSuccess: () => {
      toast({ title: "Password reset", description: `${user.firstName} has been logged out everywhere.` });
      onClose();
    },
    onError: (error) => form.setError("password", { message: error.message }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user.firstName}</DialogTitle>
          <DialogDescription>They'll be logged out everywhere and will need this new password.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="space-y-4">
            <TextField
              control={form.control}
              name="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              autoFocus
              description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={reset.isPending}>
                {reset.isPending ? "Saving..." : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
