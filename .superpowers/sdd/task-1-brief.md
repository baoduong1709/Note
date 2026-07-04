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
