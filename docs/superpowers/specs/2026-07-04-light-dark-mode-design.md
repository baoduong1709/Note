# Design Document: Light/Dark Mode Implementation

## Goal
Implement a fully functional and polished Light/Dark mode toggle in the Personal AI Notebook application. The application defaults to Dark Mode. This feature will allow the user to switch to Light Mode, with settings saved in `localStorage`, maintaining consistent aesthetics using Tailwind CSS and CSS Variables for glassmorphic elements.

## Architecture & Tech Stack
- **Framework**: React (v19) with TypeScript
- **Styling**: Tailwind CSS (v3.4.1) & PostCSS
- **Storage**: Browser `localStorage` for theme persistence
- **State Management**: React state at `App.tsx` passed down to views/components

---

## Detailed Design

### 1. Tailwind Config Update (`tailwind.config.js`)
We will enable class-based dark mode by adding `darkMode: 'class'` to the Tailwind config. This allows us to use `dark:` prefix class names.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        darkbg: '#0f0f12',
        darkcard: 'rgba(23, 23, 28, 0.7)',
        accentPurple: '#8b5cf6',
        accentTeal: '#0d9488',
      }
    },
  },
  plugins: [],
}
```

### 2. CSS Variables System (`src/index.css`)
To avoid changing custom glassmorphic panels and inputs in hundreds of places, we will transition their static colors to CSS variables that automatically adapt when the `.dark` class is applied to the root element.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Light Mode Variables */
  --glass-bg: rgba(255, 255, 255, 0.75);
  --glass-border: rgba(0, 0, 0, 0.06);
  --glass-input-bg: rgba(0, 0, 0, 0.02);
  --glass-input-border: rgba(0, 0, 0, 0.08);
  --scrollbar-thumb: rgba(0, 0, 0, 0.12);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.25);
  --text-active-menu: #1e1b4b; /* dark indigo text */
  --bg-active-menu: rgba(139, 92, 246, 0.08);
}

.dark {
  /* Dark Mode Variables */
  --glass-bg: rgba(23, 23, 28, 0.65);
  --glass-border: rgba(255, 255, 255, 0.04);
  --glass-input-bg: rgba(255, 255, 255, 0.03);
  --glass-input-border: rgba(255, 255, 255, 0.08);
  --scrollbar-thumb: rgba(255, 255, 255, 0.08);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.15);
  --text-active-menu: #ffffff;
  --bg-active-menu: rgba(139, 92, 246, 0.12);
}

@layer base {
  body {
    @apply bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 antialiased overflow-hidden font-sans h-screen w-screen transition-colors duration-200;
  }
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Glassmorphism Panels */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}

.glass-input {
  background: var(--glass-input-bg);
  border: 1px solid var(--glass-input-border);
}
.glass-input:focus {
  border-color: #8b5cf6;
  background: var(--glass-bg);
  outline: none;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.15);
}

/* Menu Active States */
.menu-active {
  color: var(--text-active-menu);
  background: var(--bg-active-menu);
  border-left: 3px solid #8b5cf6;
}
```

### 3. State Integration (`src/App.tsx`)
We manage the `theme` state at the root level:
```typescript
const [theme, setTheme] = useState<"light" | "dark">(() => {
  return (localStorage.getItem("theme") as "light" | "dark") || "dark";
});

useEffect(() => {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}, [theme]);
```
The App container element background class needs to change from static `bg-[#0b0b0d]` to dynamic `bg-zinc-100 dark:bg-[#0b0b0d]`.

### 4. Settings View Update (`src/views/SettingsView.tsx`)
Add a new theme configuration card:
- Displays options: "Giao diện Sáng (Light Mode)" and "Giao diện Tối (Dark Mode)" with appropriate `Sun` and `Moon` icons.
- Updates the theme state on selection.
- Persists theme correctly.

### 5. Layout and Component Style Audit
- **Sidebar**:
  - Update logo title `text-white` -> `text-zinc-900 dark:text-white`.
  - Update sub-label `text-zinc-500` -> `text-zinc-500 dark:text-zinc-400`.
  - Profile card footer: `bg-white/5` -> `bg-black/5 dark:bg-white/5`, names `text-white` -> `text-zinc-800 dark:text-white`.
- **DashboardView**:
  - Main headers: `text-white` -> `text-zinc-900 dark:text-white`.
  - Widget titles: `text-white` -> `text-zinc-800 dark:text-white`.
  - Textboxes & inputs: update background classes to use `glass-input`.
- **NotesView**:
  - List header: `text-zinc-500` -> `text-zinc-500 dark:text-zinc-400`.
  - Active note items: replace static dark border with adaptive border classes.
  - RichTextEditor: make sure editor text and backgrounds adapt perfectly to dark mode.
- **TasksView**:
  - Column headers, card descriptions: replace static white/dark classes with adaptive Tailwind classes.
- **AIChatPanel**:
  - Chat bubbles: User bubbles `bg-purple-600` stays consistent, Assistant bubbles use `bg-black/5 dark:bg-white/5` with adaptive text colors.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify there are no compilation or type check errors with the new properties.

### Manual Verification
- Check theme persistence: Select Light mode, reload the app, confirm Light mode stays active.
- Verify readability: Check contrast of all texts (Note titles, Sidebar items, Chat messages) in both Light and Dark modes.
- Verify glassmorphic elements (`.glass-panel`, `.glass-input`) render with clean borders and background transparency in both themes.
