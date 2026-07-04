### Task 3: Enhance Dashboard View with Animations and Gradient Borders

**Files:**
- Modify: [src/views/DashboardView.tsx](file:///c:/Project/Note/src/views/DashboardView.tsx)

- [ ] **Step 1: Import Framer Motion and define animation variants**
At the top of `src/views/DashboardView.tsx`, import `motion` from `"framer-motion"`.
Add focus state `const [isQuickCaptureFocused, setIsQuickCaptureFocused] = useState(false);` inside the component.
Define the following motion variants for staggered entry:
```typescript
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
};
```

- [ ] **Step 2: Update DashboardView layout with motion container**
Convert the main wrapping `div` (line 110) to `motion.div` using `containerVariants` and animate it:
```typescript
<motion.div 
  ref={containerRef} 
  variants={containerVariants}
  initial="hidden"
  animate="show"
  className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1"
>
```

- [ ] **Step 3: Apply gradient border to the Reminders Alert Section**
Convert the alert section (around line 120) to `motion.section` using `cardVariants`.
If there are important tasks, apply the `.premium-gradient-border` class; otherwise, use `.glass-panel`.
```typescript
<motion.section 
  variants={cardVariants}
  className={`${importantTasks.length > 0 ? "premium-gradient-border" : "glass-panel"} rounded-xl p-4 relative overflow-hidden transition-all duration-300`}
>
```
Ensure that if `.premium-gradient-border` is applied, the left red bar indicator (if any) is integrated cleanly, or replaced. Let's make it clean and neat.

- [ ] **Step 4: Update Quick Capture section with dynamic gradient border on focus**
Convert Quick Capture section to `motion.section` with `cardVariants` and use state-driven border class:
```typescript
<motion.section 
  variants={cardVariants}
  className={`${(isQuickCaptureFocused || quickText.trim().length > 0) ? "premium-gradient-border" : "glass-panel"} rounded-xl p-4 sm:p-5 relative overflow-hidden transition-all duration-300`}
>
```
Add `onFocus={() => setIsQuickCaptureFocused(true)}` and `onBlur={() => setIsQuickCaptureFocused(false)}` to the `textarea` element.

- [ ] **Step 5: Apply motion variants to all cards and grids**
Convert the other grid containers and widget cards:
- The sub-grid wrapping "Today Tasks" and "Command Block"
- "Today Tasks" widget card
- "Command Block" widget card
- "Recent Notes" widget card
Make sure each of them is a `<motion.div variants={cardVariants}>` or `<motion.section variants={cardVariants}>`.
Add `.premium-hover-glow` to card containers so they gently lift and glow purple/teal on hover.

- [ ] **Step 6: Save and verify that compilation is successful**
