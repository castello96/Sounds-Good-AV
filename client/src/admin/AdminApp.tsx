import { useEffect } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import AdminLayout from "./AdminLayout";
import AccountPage from "./pages/AccountPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import StaffPage from "./pages/StaffPage";
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
