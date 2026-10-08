import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from "@shared/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { api } from "../api";
import { TextField } from "../components/TextField";
import { useCurrentUser } from "../useAuth";

const formSchema = changePasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });
type FormValues = z.infer<typeof formSchema>;

export default function AccountPage() {
  const { data: user } = useCurrentUser();
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      api("POST", "/api/auth/password", { currentPassword, newPassword }),
    onSuccess: () => {
      form.reset();
      toast({ title: "Password changed", description: "Your other devices have been logged out." });
    },
    onError: (error) => form.setError("currentPassword", { message: error.message }),
  });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">
          {user?.firstName} {user?.lastName} &middot; {user?.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change password</CardTitle>
          <CardDescription>
            At least {PASSWORD_MIN_LENGTH} characters. A few random words make a strong, memorable password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => changePassword.mutate(v))} className="space-y-4">
              <TextField
                control={form.control}
                name="currentPassword"
                label="Current password"
                type="password"
                autoComplete="current-password"
              />
              <TextField
                control={form.control}
                name="newPassword"
                label="New password"
                type="password"
                autoComplete="new-password"
              />
              <TextField
                control={form.control}
                name="confirmPassword"
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
              />
              <Button type="submit" disabled={changePassword.isPending} data-testid="button-change-password">
                {changePassword.isPending ? "Saving..." : "Change password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
