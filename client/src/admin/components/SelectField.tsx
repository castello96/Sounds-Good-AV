import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SelectOptionGroup {
  label?: string;
  options: { value: string; label: string }[];
}

/**
 * A select bound to a form field. Option values are strings in the DOM; pass
 * numeric to store the chosen value as a number (for ids).
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  groups,
  numeric = false,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  groups: SelectOptionGroup[];
  numeric?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value == null ? "" : String(field.value)}
            onValueChange={(v) => field.onChange(numeric ? Number(v) : v)}
          >
            <FormControl>
              <SelectTrigger data-testid={`select-${name}`}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {groups.map((group, i) => (
                <SelectGroup key={group.label ?? i}>
                  {group.label && <SelectLabel>{group.label}</SelectLabel>}
                  {group.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
