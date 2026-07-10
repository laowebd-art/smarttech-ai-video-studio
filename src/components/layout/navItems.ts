import {
  LayoutDashboard,
  FolderKanban,
  PlusCircle,
  LayoutTemplate,
  ListVideo,
  Download,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/projects/new", label: "Create Video", icon: PlusCircle },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/render-queue", label: "Render Queue", icon: ListVideo },
  { to: "/export-center", label: "Export Center", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
];
