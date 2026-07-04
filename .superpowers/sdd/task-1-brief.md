### Task 1: Add Custom CSS Styles for Running Gradient Border and Glow

**Files:**
- Modify: [src/index.css](file:///c:/Project/Note/src/index.css)

- [ ] **Step 1: Append premium animations and border styling to `src/index.css`**
Add the following classes to the bottom of the file:
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
- [ ] **Step 2: Save the file and verify syntax**
