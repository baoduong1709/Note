# Design Document: Mobile Floating Glassmorphic Navigation Bar

## Goal
Redesign the mobile bottom navigation bar into a premium, modern floating glassmorphic dock. The active tab will be highlighted by a subtle gradient background pill that slides smoothly using Framer Motion's layout animations, combined with intuitive tap micro-interactions.

## User Review Required
None. The design style was selected and approved in the brainstorming phase (Variant A: Sliding Pill Background).

## Proposed Changes

### Component Design

#### [MODIFY] [BottomNav.tsx](file:///c:/Project/Note/src/components/BottomNav.tsx)
- Restructure the outer wrapper from a full-width pinned bar to a floating dock suspended above the bottom of the screen (`fixed bottom-4 left-4 right-4 z-20`).
- Implement high-fidelity glassmorphism using Tailwind backdrop blur and subtle borders:
  - Dark mode: `bg-zinc-950/75 border-white/10 shadow-2xl shadow-black/40`
  - Light mode: `bg-white/80 border-zinc-200/50 shadow-xl shadow-zinc-300/30`
  - Shape: `rounded-2xl` or `rounded-3xl`
- Update nav buttons to support spring tap animations (`whileTap={{ scale: 0.92 }}`).
- Integrate Framer Motion's `<motion.div layoutId="mobileActivePill" />` as the active background element. When `activeView` changes, the pill will slide smoothly to the new active item.
- Use `layout` on nav buttons to maintain alignment during transitions.
- Ensure proper padding adjustments for mobile device safe areas (`env(safe-area-inset-bottom)`).

#### [MODIFY] [index.css](file:///c:/Project/Note/src/index.css)
- Clean up any obsolete classes related to the old bottom nav dot indicators if necessary.
- Add specific utility classes for active state glowing icons and light/dark mode glass configurations if needed.

## Verification Plan

### Automated Tests
- Run `npm run build` to verify compiling and bundler output correctness.

### Manual Verification
- Resize the browser or simulate mobile device views to test the layout.
- Verify that swapping between views on mobile triggers a smooth horizontal sliding transition of the active kén (pill) background.
- Check that pressing any item triggers a quick shrink feedback animation (`whileTap`).
- Verify correct appearance and readability in both Light and Dark modes.
- Ensure the floating dock is correctly placed and respects the safe area inset at the bottom of the screen.
