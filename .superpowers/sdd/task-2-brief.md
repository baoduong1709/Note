### Task 2: Page Transitions with Framer Motion in `App.tsx`

**Files:**
- Modify: [src/App.tsx](file:///c:/Project/Note/src/App.tsx)

- [ ] **Step 1: Import motion and AnimatePresence**
At the top of `src/App.tsx`, import `motion` and `AnimatePresence` from `"framer-motion"`.
- [ ] **Step 2: Wrap the active view output with motion tags**
Locate the `<main>` tag around line 253:
```typescript
<main key={activeView} className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-4 sm:p-6 pb-20 md:pb-6 view-enter-animate">
  {/* Render Active Tab */}
  {renderView()}
</main>
```
Modify it to remove `view-enter-animate` and wrap `{renderView()}` inside `<AnimatePresence>`:
```typescript
<main className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-4 sm:p-6 pb-20 md:pb-6">
  {/* Render Active Tab with Framer Motion transitions */}
  <AnimatePresence mode="wait">
    <motion.div
      key={activeView}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden"
    >
      {renderView()}
    </motion.div>
  </AnimatePresence>
</main>
```
- [ ] **Step 3: Save `src/App.tsx` and verify that the app builds correctly**
