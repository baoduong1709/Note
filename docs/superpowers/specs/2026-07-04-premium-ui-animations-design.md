# Design Document: Premium UI & Animation Enhancements

## Goal
Improve the user interface aesthetics of the Personal AI Notebook application, making it feel premium, responsive, and alive. This will be achieved by implementing:
1. **Running Gradient Borders**: Custom moving gradient borders around key components (Important Tasks card, Quick Capture text area, active AI Chat Panel, active menu items).
2. **Smooth View Transitions**: Integrating Framer Motion page-level animations.
3. **Staggered Mount Animations**: Staggered entry transitions for cards and list items.
4. **Premium Hover Glows**: Subtle lift-up and glowing shadow effects on interactable components.

## Architecture & Tech Stack
- **Framework**: React (v19) with TypeScript
- **Styling**: Tailwind CSS (v3.4.1), PostCSS, and Custom CSS in `src/index.css`
- **Animation**: Framer Motion (v12.4.2)

---

## Detailed Design

### 1. CSS Design System Updates (`src/index.css`)
We will define custom CSS classes for the running gradient borders. The rotating border will use a pseudo-element with a rotating `conic-gradient` mask.

```css
/* Animated Running Gradient Border */
.premium-gradient-border {
  position: relative;
  background: var(--glass-bg);
  border-radius: 12px;
  z-index: 1;
}

.premium-gradient-border::before {
  content: "";
  position: absolute;
  top: -1.5px;
  left: -1.5px;
  right: -1.5px;
  bottom: -1.5px;
  background: conic-gradient(
    from 0deg,
    #8b5cf6 0%,
    #0d9488 25%,
    #ec4899 50%,
    #8b5cf6 75%,
    #0d9488 100%
  );
  border-radius: 13.5px;
  z-index: -1;
  animation: rotateGradient 4s linear infinite;
  opacity: 0.85;
}

.premium-gradient-border::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--glass-bg);
  border-radius: 12px;
  z-index: -1;
}

@keyframes rotateGradient {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Hover Accent Card Glow */
.premium-hover-glow {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.premium-hover-glow:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.15), 0 8px 10px -6px rgba(139, 92, 246, 0.1);
}
```

### 2. Main Page Transitions (`src/App.tsx`)
We will import `motion` and `AnimatePresence` from `framer-motion` to wrap the rendered view, enabling fluid switching of tabs:
```typescript
import { motion, AnimatePresence } from "framer-motion";
// ...
<main className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-4 sm:p-6 pb-20 md:pb-6">
  {/* Mobile bar */}
  <AnimatePresence mode="wait">
    <motion.div
      key={activeView}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden"
    >
      {renderView()}
    </motion.div>
  </AnimatePresence>
</main>
```

### 3. Component Enhancements

#### A. Dashboard (`src/views/DashboardView.tsx`)
- Apply `.premium-gradient-border` to the "Cần chú ý" (Important Tasks) warning block.
- Add `staggerChildren` layout list animation for today tasks and recent notes.
- Apply `.premium-gradient-border` to the quick-save text area container when focused or typed in.

#### B. Sidebar (`src/components/Sidebar.tsx`)
- Enhance navigation buttons using `whileHover` and `whileTap` micro-interactions.
- Add dynamic background transitions for active menu items.

#### C. AI Chat Panel (`src/components/AIChatPanel.tsx`)
- When the assistant is streaming or typing, apply the moving gradient border around the chat entry input and active container.
- Animate message bubbles as they mount.

---

## Verification Plan

### Automated Verification
- Run `npm run build` to verify there are no compilation or bundler errors.

### Manual Verification
- Test swapping between views and ensure transitions are smooth, jitter-free, and correctly adapt to Light and Dark mode.
- Verify that the running gradient border displays with appropriate thickness, smooth rotation, and correct border radii.
- Verify micro-interactions on side navigation items, dashboard cards, and the AI panel toggle button.
