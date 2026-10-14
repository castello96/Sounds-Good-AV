import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { MAX_EQUIPMENT_TAGS, tagSchema, type TagRef } from "@shared/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { invalidateInventory, useTags } from "../inventory";

/**
 * Toggles tags on and off, with a box to add a tag that doesn't exist yet.
 * Tags are buttons rather than a dropdown so they're easy to tap on a tablet.
 */
export function TagPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { data: tags, isLoading } = useTags();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = new Set(value);
  const full = value.length >= MAX_EQUIPMENT_TAGS;

  const toggle = (id: number) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const add = () => {
    const parsed = tagSchema.safeParse({ name });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    // Picking an existing tag by typing its name is fine too.
    const existing = tags?.find((t) => t.name.toLowerCase() === parsed.data.name.toLowerCase());
    if (existing) {
      if (!selected.has(existing.id)) onChange([...value, existing.id]);
      setName("");
      return setError(null);
    }
    setAdding(true);
    api<TagRef>("POST", "/api/admin/tags", parsed.data)
      .then((tag) => {
        invalidateInventory();
        onChange([...value, tag.id]);
        setName("");
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setAdding(false));
  };

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tags...</p>
      ) : tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const on = selected.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggle(tag.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
                data-testid={`tag-option-${tag.id}`}
              >
                {on && <Check className="h-3 w-3" />}
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tags yet. Add the first one below.</p>
      )}
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the tag instead of submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="New tag, like Live Sound"
          aria-label="New tag"
          className="h-8"
          disabled={full}
          data-testid="input-new-tag"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={adding || full || !name.trim()}>
          <Plus /> Add
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
