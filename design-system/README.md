# Threadroom design system

The top-level home for reusable UI. Editor panels and canvas behavior live in `app/`; their controls come from `@/design-system`. No external component library is needed.

```tsx
import {Button, Icon, IconButton, Input, Toolbar} from '@/design-system';

<Toolbar aria-label={t('Point editing tools')}>
  <Button variant="ghost" aria-pressed={moving} onClick={move}>
    <Icon name="select"/>{t('Move')}
  </Button>
  <IconButton aria-label={t('Delete')} onClick={remove}>
    <Icon name="delete"/>
  </IconButton>
  <Button variant="primary" disabled={!canFinish} onClick={finish}>
    {t('Done')}
  </Button>
</Toolbar>

<label>{t('Project name')}<Input value={name} onChange={rename}/></label>
```

| Component | Use |
| --- | --- |
| `Button` | Ordinary actions; defaults to `secondary`, `md`, and `type="button"` |
| `IconButton` | Square button; requires `aria-label`; defaults to `ghost` |
| `ToolButton` | Vertical icon and label in the editor dock; `ghost`, 44px |
| `MenuItem` | Full-width, left-aligned menu action; accepts native menu roles |
| `Input`, `Textarea` | Native fields, including checkbox, range, colour, and file inputs |
| `Select` | Styled native dropdown and option list; normal-weight text, custom chevron, shared focus/disabled/invalid states |
| `Toolbar`, `ToolbarDivider` | Shared floating action surface and separator |
| `SegmentedControl` | Group related options; set ARIA selection state on each button |
| `MenuPopover`, `MenuGroup` | Grouped action menus with labeled sections, arrow-key navigation, and compact inline choices |
| `Popover` | Native popover surface; positioning and trigger remain with the caller |
| `Dialog`, `Modal` | Native dialog surface; `Modal` adds a title, portal, and modal lifecycle |
| `Hint`, `ToolHint` | Focus/hover help and tool guidance |
| `Section` | Collapsible section with remembered expansion |
| `Icon` | Shared 24-unit stroke icons; accepts a named icon or custom `path` |
| `ToolGroupButton` | Dock tool with a native popover of alternatives |

Button variants are `primary`, `secondary`, `ghost`, `soft`, `danger`, and `link`. Use `item` for content-rich choice rows and `swatch` for document dye colours. Sizes are `sm` (28px), `md` (32px), `lg` (40px), and `xl` (44px). Text can wrap when space is limited. Keep all actions in a toolbar at the same size.

`loading` shows a reduced-motion-aware spinner, sets `aria-busy`, and disables repeated activation. All controls preserve native refs, events, form props, popover attributes, and accessibility attributes. Selection comes from `aria-pressed`, `aria-checked`, `aria-selected`, or `aria-current`; focus and disabled styles work in dialogs portaled outside the editor too.

`Select` accepts native `<option>` and `<optgroup>` children and preserves labels, refs, form values, validation, keyboard navigation, and mobile pickers. Use `controlSize="sm"` (28px), the default `md` (32px), or `lg` (40px); native `size` and `multiple` still create a listbox. `select.css` owns its trigger, chevron, and option states. Browsers with customizable native pickers also render the themed option list; other browsers retain their native picker with the shared trigger styling.

`tokens.css` owns shared colours, sizes, spacing, and radii. `styles.css` owns primitive appearance and states; `composites.css` owns the shared composites. The root layout imports them once. CSS layers are ordered `tokens`, `app`, `components`: feature CSS may arrange controls and render artwork, while shared component styles determine their appearance. Artwork and thread colours are data and remain separate from UI colours.

Add reusable patterns here, export them from `index.ts`, and migrate callers. Do not introduce raw native controls in `app/`, add a second button implementation, or override component interaction states from editor CSS. `tests/design-system.test.mjs` guards the native-control boundary and native button behavior.
