import { useCurrentUser } from "../useAuth";

export default function DashboardPage() {
  const { data: user } = useCurrentUser();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome back, {user?.firstName}</h1>
      <p className="text-muted-foreground">
        Inquiries and bookings will show up here as those sections are added. Use Inventory to build the equipment catalog.
      </p>
    </div>
  );
}
