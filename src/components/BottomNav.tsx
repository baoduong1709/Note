import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings,
  Share2
} from "lucide-react";

interface BottomNavProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

export default function BottomNav({ activeView, setActiveView }: BottomNavProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "notes", label: "Notes", icon: FileText },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "calendar", label: "Lịch", icon: Calendar },
    { id: "share", label: "Share", icon: Share2 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-panel border-t border-zinc-200 dark:border-white/5 flex items-center justify-around z-20 px-3 bg-zinc-50/95 dark:bg-zinc-950/95 shadow-lg shrink-0 relative overflow-hidden">
      {/* Subtle gradient shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/[0.03] to-transparent pointer-events-none"></div>
      
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center gap-1 transition-all relative ${
              isActive 
                ? "text-purple-650 dark:text-purple-400 font-semibold scale-105" 
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? "icon-glow" : ""}`} />
            <span className="text-[9px]">{item.label}</span>
            {/* Animated gradient dot indicator */}
            {isActive && <span className="nav-dot-active absolute -bottom-1"></span>}
          </button>
        );
      })}
    </div>
  );
}
