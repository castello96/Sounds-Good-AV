import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { FolderTree, LayoutDashboard, LogOut, Package, UserCog, Users } from "lucide-react";
import type { PublicUser } from "@shared/users";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useLogout } from "./useAuth";

// Paths are relative to /admin. Add sections here as later phases land.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/staff", label: "Staff", icon: Users },
];

export default function AdminLayout({ user, children }: { user: PublicUser; children: ReactNode }) {
  const [location] = useLocation();
  const logout = useLogout();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            Sounds Good <span className="text-primary">AV</span>
          </Link>
          <span className="text-xs text-muted-foreground">Staff portal</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.href === "/" ? location === "/" : location.startsWith(item.href)}>
                      <Link href={item.href} data-testid={`nav-${item.label.toLowerCase()}`}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/account"}>
                <Link href="/account" data-testid="nav-account">
                  <UserCog />
                  <span className="truncate">
                    {user.firstName} {user.lastName}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => logout.mutate()} disabled={logout.isPending} data-testid="button-logout">
                <LogOut />
                <span>Log out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b px-4">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
