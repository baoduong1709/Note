import React from "react";
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings 
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
    { id: "daily", label: "Daily", icon: Calendar },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-panel border-t border-white/5 flex items-center justify-around z-20 px-3 bg-zinc-950/95 shadow-lg shrink-0">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center gap-1 transition-all ${
              isActive 
                ? "text-purple-400 font-semibold scale-105" 
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
