import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  type = "text",
  autoComplete,
  autoFocus,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ""}
              type={type}
              autoComplete={autoComplete}
              autoFocus={autoFocus}
              data-testid={`input-${name}`}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
