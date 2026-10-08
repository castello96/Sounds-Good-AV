import { z } from "zod";

// Long passphrases beat complexity rules. The upper bound keeps hashing cheap
// enough that huge inputs can't be used to tie up the server.
export const PASSWORD_MIN_LENGTH = 12;
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, "Password must be at most 128 characters");

const email = z.string().trim().toLowerCase().email("Please enter a valid email address");
const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(100);

// What the API returns for a staff user. Never includes the password hash.
export interface PublicUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

export const loginSchema = z.object({
  email,
  // Not the full password rule: a login attempt only needs to be checked, not judged.
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  email,
  firstName: name("First name"),
  lastName: name("Last name"),
  password,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    email,
    firstName: name("First name"),
    lastName: name("Last name"),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
