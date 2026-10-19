# Accessibility

What Feather does now, and what's still to do.

## Done

- **Keyboard.** Every screen works without a mouse. Ctrl+K opens search from anywhere; arrow keys move through results; Esc closes overlays. The first-run tour steps with Enter or the right arrow and closes with Esc.
- **Visible focus.** A 2 px accent ring on whatever has keyboard focus (`:focus-visible`), so it shows for keyboard users without getting in the way of mouse and pen.
- **Contrast.** Body text is `#e8ecdf` on `#0c0d0b` (about 16:1). Secondary text was raised to `#7f8878` (about 5:1) to pass WCAG AA for small text.
- **Reduced motion.** With the system's reduce-motion setting on, the quill animation, page glides, count-ups and tour transitions are skipped.
- **Structure.** Landmarks for navigation and main content; the Today strip is a labelled list; dialogs (tour, search) have roles and labels; icons inside labelled buttons are hidden from screen readers.
- **Pen and touch.** Palm rejection and a wrist guard, adjustable pen width, and finger drawing that switches off by itself once a real pen is seen.
- **Reading mode.** A wider, calmer layout with a serif face for long reading in the Vault and documents.

## To do

- A full pass with NVDA and Narrator across every screen.
- Text alternatives for handwriting: Paper pages are searchable, but a screen reader can't yet read a page aloud in order.
- A light theme and a high-contrast theme.
- Larger text sizes that reflow the canvas toolbar.
