import { useCurrentUser } from "../useAuth";

export default function DashboardPage() {
  const { data: user } = useCurrentUser();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome back, {user?.firstName}</h1>
      <p className="text-muted-foreground">
        New website inquiries land in Bookings. Use Inventory to manage the equipment catalog.
      </p>
    </div>
  );
}
