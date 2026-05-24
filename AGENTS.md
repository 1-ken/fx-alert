# Agent Working Standards

This repository follows the standards in `.github/copilot-instructions.md`.

## Enforced Exceptions

- Keep `types/auth.ts`, `types/next-auth.ts`, and `types/leaflet-draw.d.ts` at the `types/` root because they are cross-cutting type augmentations.
- Keep ProseMirror, article typography, print layout, and global direction helpers in `app/globals.css` where utility classes cannot reliably target generated content.
- Keep CSS-variable inline style bindings in `components/ui/sidebar.tsx` for runtime width tokens.

## Function Documentation Standard

Every function, hook, component, and API route handler must include:

1. A JSDoc block explaining intent, params, and return behavior.
2. Inline comments for non-trivial branches, transforms, and side effects.

Avoid comments that just restate obvious code.
