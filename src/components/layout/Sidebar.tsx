import { NavLink } from "react-router-dom";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./navItems";

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-gray-100 dark:border-gray-800">
        <div className="rounded-lg bg-primary-600 p-1.5">
          <Clapperboard className="h-5 w-5 text-white" />
        </div>
        <span className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
          SmartTech AI
          <br />
          Video Studio
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/projects"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              )
            }
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
        v1.0.0
      </div>
    </aside>
  );
}
