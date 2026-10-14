import { useEffect } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import AdminLayout from "./AdminLayout";
import AccountPage from "./pages/AccountPage";
import BookingPage from "./pages/BookingPage";
import BookingsPage from "./pages/BookingsPage";
import CategoriesPage from "./pages/CategoriesPage";
import DashboardPage from "./pages/DashboardPage";
import EquipmentPage from "./pages/EquipmentPage";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import LostAndRepairPage from "./pages/LostAndRepairPage";
import OutNowPage from "./pages/OutNowPage";
import PackPage from "./pages/PackPage";
import StaffPage from "./pages/StaffPage";
import TagsPage from "./pages/TagsPage";
import { useCurrentUser } from "./useAuth";

/**
 * The staff portal, mounted at /admin and loaded only when someone visits it.
 * Every route shows the login form until there's a session, so a deep link
 * like /admin/staff lands on the right page after logging in.
 */
export default function AdminApp() {
  useNoIndex();
  const { data: user, isLoading, error } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return <div className="min-h-screen flex items-center justify-center p-4">Couldn't reach the server. Please refresh.</div>;
  }
  if (!user) return <LoginPage />;

  return (
    <AdminLayout user={user}>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/bookings" component={BookingsPage} />
        <Route path="/bookings/:id/pack" component={PackPage} />
        <Route path="/bookings/:id" component={BookingPage} />
        <Route path="/out" component={OutNowPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/inventory/lost-and-repair" component={LostAndRepairPage} />
        <Route path="/inventory/:id" component={EquipmentPage} />
        <Route path="/categories" component={CategoriesPage} />
        <Route path="/tags" component={TagsPage} />
        <Route path="/staff" component={StaffPage} />
        <Route path="/account" component={AccountPage} />
        <Route>
          <p className="text-muted-foreground">Page not found.</p>
        </Route>
      </Switch>
    </AdminLayout>
  );
}

// Belt and braces with the server's X-Robots-Tag header.
function useNoIndex() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Staff Portal | Sounds Good AV";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);
}
