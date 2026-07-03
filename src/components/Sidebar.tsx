import React from "react";
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings, 
  BrainCircuit
} from "lucide-react";

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  jiraConnected: boolean;
}

export default function Sidebar({ activeView, setActiveView, jiraConnected }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "notes", label: "Notes Editor", icon: FileText },
    { id: "tasks", label: "Tasks & Kanban", icon: CheckSquare },
    { id: "daily", label: "Daily Notes", icon: Calendar },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-white/5 flex flex-col h-full z-10 shrink-0 hidden md:flex">
      {/* Header Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-teal-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-white">AI NOTEBOOK</h1>
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Personal Work v2</span>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive 
                    ? "menu-active text-white" 
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Workspace Mock Section */}
        <div className="space-y-1">
          <p className="px-3 text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">WORKSPACES</p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>GL Work</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
            <span>Game Dev</span>
          </div>
        </div>
      </nav>

      {/* Footer Profile & Settings */}
      <div className="p-3 border-t border-white/5 flex flex-col gap-2 shrink-0">
        <button
          onClick={() => setActiveView("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeView === "settings"
              ? "menu-active text-white"
              : "text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings & Jira</span>
        </button>

        <div className="px-3 py-2 flex items-center gap-2.5 bg-white/5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
            B
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">Bao Duong</p>
            <span className="text-[8px] text-zinc-500">
              {jiraConnected ? "Jira Connected" : "Jira Disconnected"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
