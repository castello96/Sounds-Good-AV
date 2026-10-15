import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { OutOfServiceTable } from "../components/GearIssues";
import { useOutOfService } from "../inventory";

/** Everything in repair or lost, newest first, ready to settle. */
export default function LostAndRepairPage() {
  const { data: entries } = useOutOfService();

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Inventory
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Lost and repair</h1>
        <p className="text-muted-foreground">
          Gear that can't be booked until it's repaired or found. Write it off if it's gone for good.
        </p>
      </div>
      <OutOfServiceTable entries={entries} showEquipment empty="Nothing is in repair or lost." />
    </div>
  );
}
