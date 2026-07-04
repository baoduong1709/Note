# Mobile Floating Glassmorphic Navigation Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the mobile navigation bar into a floating, glassmorphic dock with a smooth sliding active background pill and press animations.

**Architecture:** Restructure the existing bottom bar in `BottomNav.tsx` to use fixed floating positioning. Add Framer Motion's `layoutId` for sliding pill background transitions and spring tap gestures for button interaction. Adjust main content padding in `App.tsx` to accommodate the floating nav.

**Tech Stack:** React 19, Tailwind CSS v3, Framer Motion v12, Lucide React

## Global Constraints
- Answer in chat in Vietnamese.
- Create git commit messages in English.
- Add code comments in English.
- Do not automatically commit.

---

### Task 1: Update Main View Layout Spacing

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: None
- Produces: Correct bottom padding in mobile view so content isn't hidden behind the floating nav.

- [ ] **Step 1: Modify App.tsx main content padding**
  Change the `<main>` wrapper padding to add `pb-24` on mobile screens to offset the floating navigation bar.
  
  In [src/App.tsx](file:///c:/Project/Note/src/App.tsx):
  ```tsx
  // Around line 330:
  <main className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-4 sm:p-6 pb-24 md:pb-6">
  ```

- [ ] **Step 2: Verify compilation**
  Run `npm run build` to verify that the change doesn't break compilation.

---

### Task 2: Implement Floating Glassmorphic Dock in BottomNav

**Files:**
- Modify: `src/components/BottomNav.tsx`

**Interfaces:**
- Consumes: `activeView` and `setActiveView` props.
- Produces: A floating mobile dock navigation bar with sliding kén (pill) background and tap feedback.

- [ ] **Step 1: Import framer-motion in BottomNav.tsx**
  Add the import statement for `motion` at the top of the file.
  
  In [src/components/BottomNav.tsx](file:///c:/Project/Note/src/components/BottomNav.tsx):
  ```tsx
  import { motion } from "framer-motion";
  ```

- [ ] **Step 2: Rewrite the BottomNav component layout and interactivity**
  Replace the JSX in `src/components/BottomNav.tsx` with a floating, glassmorphic design that incorporates `<motion.button>` and `<motion.div layoutId="mobileActivePill">` for smooth sliding transitions.
  
  In [src/components/BottomNav.tsx](file:///c:/Project/Note/src/components/BottomNav.tsx):
  ```tsx
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
        className="md:hidden fixed left-4 right-4 z-30 h-16 backdrop-blur-xl bg-white/75 dark:bg-zinc-950/75 border border-zinc-200/50 dark:border-white/10 rounded-2xl flex items-center justify-around px-2 shadow-2xl shadow-zinc-300/20 dark:shadow-black/50 transition-all duration-300"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              whileTap={{ scale: 0.92 }}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 relative transition-colors duration-200 select-none z-10 ${
                isActive 
                  ? "text-purple-600 dark:text-purple-400 font-semibold" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "filter drop-shadow-[0_0_4px_rgba(147,51,234,0.4)]" : ""}`} />
              <span className="text-[9px] mt-0.5">{item.label}</span>
              
              {/* Sliding active pill background */}
              {isActive && (
                <motion.div
                  layoutId="mobileActivePill"
                  className="absolute inset-x-1 inset-y-0.5 bg-gradient-to-r from-purple-500/10 to-teal-500/5 dark:from-purple-500/20 dark:to-teal-500/10 border border-purple-500/20 dark:border-purple-500/30 rounded-xl -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    );
  }
  ```

- [ ] **Step 3: Run project build and verify**
  Run `npm run build` to verify there are no compilation or bundling errors.
