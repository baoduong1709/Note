import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings,
  Share2
} from "lucide-react";
import { motion } from "framer-motion";

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
    <div 
      className="md:hidden fixed left-4 right-4 z-30 h-[50px] backdrop-blur-xl bg-white/75 dark:bg-zinc-950/75 border border-zinc-200/50 dark:border-white/10 rounded-2xl flex items-center justify-around px-2 shadow-2xl shadow-zinc-300/20 dark:shadow-black/50 transition-all duration-300"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <motion.button
            key={item.id}
            type="button"
            layout
            onClick={() => setActiveView(item.id)}
            whileTap={{ scale: 0.92 }}
            className={`flex items-center justify-center flex-1 h-full relative transition-colors duration-200 select-none z-10 ${
              isActive 
                ? "text-purple-600 dark:text-purple-400 font-semibold" 
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className={`w-[22px] h-[22px] ${isActive ? "filter drop-shadow-[0_0_6px_rgba(147,51,234,0.5)]" : ""}`} />
            
            {/* Sliding active pill background */}
            {isActive && (
              <motion.div
                layoutId="mobileActivePill"
                className="absolute w-[40px] h-[40px] rounded-xl -z-10 nav-active-gradient-border"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
