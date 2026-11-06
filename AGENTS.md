<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system

- Put all reusable UI components in the top-level `design-system/` folder and export them from `design-system/index.ts`. Import them through `@/design-system`.
- Use `Button`, `IconButton`, `ToolButton`, and `MenuItem` for actions; `Input`, `Select`, and `Textarea` for fields; and the shared toolbar, segmented control, popover, dialog, hint, icon, and section components. Native control elements belong inside the design system. Editor panels and canvas components stay in `app/` and compose these primitives.
- Choose an explicit semantic button variant: `primary` for completing/applying an action, `secondary` for ordinary actions, `ghost` for toolbar actions, `soft` for emphasized entry actions, `danger` for destructive actions, and `link` for inline actions. `item` is for content-rich selection rows; `swatch` preserves document dye colours. Icon-only actions require an accessible label.
- Use shared sizes (`sm` 28px, default `md` 32px, `lg` 40px, `xl` 44px). Controls in the same toolbar use the same size. Use native `disabled` and ARIA selection attributes; do not restyle their states in feature CSS.
- Use the shared `Select` for dropdowns with native `<option>` children. Set `controlSize="sm"` for compact controls or `"lg"` for larger ones; native `size` remains the listbox row count. Keep the trigger, chevron, picker options and selection states in `design-system/select.css`; preserve native keyboard, form and touch behavior.
- Own tokens, typography, borders, radii, and hover/pressed/selected/focus/disabled/loading states in `design-system/`. Keep `app/globals.css` for editor layout, canvas rendering, and document previews. The declared CSS layers let shared components own their appearance without specificity overrides or `!important`.
- Extend an existing primitive or add one to the design system when a reusable pattern is missing. Do not add a second component library or copy button/field styles into a feature. See `design-system/README.md` for usage.
- Verify UI migrations with `npm run typecheck`, `npm test`, and `npm run build`, then check the affected controls at desktop and mobile widths, including keyboard focus and disabled/selected states.
