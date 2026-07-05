import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Mail, Bell, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "AR Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/aging-report", label: "Aging Report", icon: FileSpreadsheet, exact: false },
    { href: "/analysts", label: "Team Overview", icon: Users, exact: false },
    { href: "/mailbox", label: "Team Mailbox", icon: Mail, exact: false },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold tracking-tight">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-[10px] font-bold leading-none">AR</span>
            </div>
            CollectBase
          </div>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = item.exact ? location === item.href : location.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="p-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground/50 text-center">CollectBase MVP</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-card shrink-0">
          <div className="font-bold text-primary md:hidden">CollectBase</div>
          <div className="hidden md:flex flex-1" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
              <Bell className="w-4 h-4" />
            </Button>
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
              SM
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
