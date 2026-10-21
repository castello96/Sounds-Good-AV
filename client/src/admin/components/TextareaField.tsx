import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: {
  // Any transformed type, so forms whose schema reshapes values (like null for "unsure") fit.
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={field.value ?? ""} rows={3} data-testid={`input-${name}`} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
