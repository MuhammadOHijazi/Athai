import React from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { LayoutDashboard, PlusSquare, Box, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import athaiBrandLogo from "@assets/logo.png";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: PlusSquare },
  { href: "/models", label: "My Models", icon: Box },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col bg-card/30 backdrop-blur-sm hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src={athaiBrandLogo} alt="Ath.ai Logo" className="h-5 w-auto" />
            <span className="font-semibold tracking-tight text-sm">Ath.ai</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group cursor-pointer",
                  location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href))
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-4 w-4",
                  location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href))
                    ? "text-accent"
                    : "text-muted-foreground group-hover:text-foreground"
                )} />
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-xs overflow-hidden">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={user?.fullName || ""} className="h-full w-full object-cover" />
              ) : (
                user?.firstName?.charAt(0) || "U"
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium truncate">{user?.fullName || "User"}</span>
              <span className="text-[10px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button 
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-border md:hidden bg-background">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src={athaiBrandLogo} alt="Ath.ai Logo" className="h-5 w-auto" />
          </Link>
          {/* Add mobile menu toggle here if needed */}
        </header>

        <div className="flex-1 overflow-auto bg-muted/20">
          <div className="mx-auto max-w-5xl p-6 md:p-10 lg:p-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
