import { Home, MessageCircle, Users, User } from "lucide-react";
import { Link, useLocation } from "react-router";

export function MobileNavigation() {
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "Home", path: "/home" },
    { icon: MessageCircle, label: "Chat", path: "/chat" },
    { icon: Users, label: "Connections", path: "/connections" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-glass-bg backdrop-blur-xl border-t border-glass-border z-50 md:hidden">
      <div className="flex items-center justify-around px-4 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-6 h-6 ${isActive ? "fill-primary" : ""}`} />
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopSidebar() {
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "Home", path: "/home" },
    { icon: MessageCircle, label: "Chat", path: "/chat" },
    { icon: Users, label: "Connections", path: "/connections" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-glass-bg backdrop-blur-xl border-r border-glass-border flex-col">
      <div className="p-6">
        <h1 className="text-2xl bg-gradient-to-r from-gradient-purple via-gradient-pink to-gradient-blue bg-clip-text text-transparent">
          Vently
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Anonymous chats</p>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
