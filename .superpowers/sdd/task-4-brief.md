### Task 4: Add Micro-interactions to Sidebar and AI Chat Panel

**Files:**
- Modify: [src/components/Sidebar.tsx](file:///c:/Project/Note/src/components/Sidebar.tsx)
- Modify: [src/components/AIChatPanel.tsx](file:///c:/Project/Note/src/components/AIChatPanel.tsx)

- [ ] **Step 1: Modify Sidebar.tsx to use Framer Motion**
Import `motion` from `"framer-motion"` at the top of `src/components/Sidebar.tsx`.
Convert menu items rendering buttons to `motion.button`:
```typescript
<motion.button
  key={item.id}
  type="button"
  onClick={() => setActiveView(item.id)}
  whileHover={{ x: 4 }}
  whileTap={{ scale: 0.97 }}
  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
    isActive 
      ? "menu-active text-zinc-900 dark:text-white" 
      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
  }`}
>
```
Also convert the profile/settings button at the bottom to `motion.button` with `whileHover={{ x: 4 }}` and `whileTap={{ scale: 0.97 }}`.

- [ ] **Step 2: Add dynamic gradient border to the input box in AIChatPanel.tsx**
Import `motion` from `"framer-motion"` at the top of `src/components/AIChatPanel.tsx`.
Define a focus state inside `AIChatPanel`:
```typescript
const [isInputFocused, setIsInputFocused] = useState(false);
```
Modify the AI Chat Input rendering section (around line 682). Wrap the input in a container that gets `.premium-gradient-border` when focused or loading:
```typescript
{/* 4. AI Chat Input */}
<div className="p-3 border-t border-zinc-200 dark:border-white/5 shrink-0">
  <div className={`relative flex items-center w-full rounded-lg transition-all duration-300 ${
    (isInputFocused || loading) ? "premium-gradient-border" : "glass-panel"
  }`}>
    <input 
      type="text" 
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && handleSend()}
      onFocus={() => setIsInputFocused(true)}
      onBlur={() => setIsInputFocused(false)}
      disabled={loading}
      placeholder={loading ? "Agent đang trả lời..." : "Hỏi hoặc tạo note, task, ngày quan trọng..."} 
      className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-transparent border-none text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none disabled:opacity-50"
    />
    <button 
      type="button"
      onClick={handleSend}
      disabled={loading}
      className="absolute right-2 p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all disabled:opacity-50"
    >
      <Send className="w-4 h-4" />
    </button>
  </div>
</div>
```

- [ ] **Step 3: Animate message bubbles in AIChatPanel.tsx**
Modify the message bubbles mapping (around line 645) to use `motion.div` instead of standard `div`.
Remove `.chat-bubble-animate` from the classes and use Framer Motion properties instead:
For User message bubbles:
```typescript
<motion.div 
  key={index}
  initial={{ opacity: 0, scale: 0.96, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
  className="text-right"
>
```
For Assistant message bubbles:
```typescript
<motion.div 
  key={index}
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
  className="bg-zinc-200/50 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-200 dark:border-white/5 text-zinc-700 dark:text-zinc-300 leading-relaxed text-left shadow-sm"
>
```

- [ ] **Step 4: Save and verify that everything compiles successfully**
Run `npm run build` to verify there are no compilation errors.
