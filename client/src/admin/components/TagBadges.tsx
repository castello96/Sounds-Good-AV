import type { TagRef } from "@shared/inventory";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A row of small tag labels. Renders nothing when there are no tags. */
export function TagBadges({ tags, className }: { tags: TagRef[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <Badge key={tag.id} variant="outline" className="font-normal">
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
