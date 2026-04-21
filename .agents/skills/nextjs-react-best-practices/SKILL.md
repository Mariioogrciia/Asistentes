---
name: nextjs-react-best-practices
description: Best practices for Next.js 14+ App Router, React, and Modern Frontend Development. TRIGGERS - Next.js, React, Frontend, UI, Tailwind, CSS Modules, components.
---

# Next.js & React Best Practices

## Architecture & App Router
- Use the **App Router** (`app/` directory) instead of the Pages router.
- **Server Components (RSC)** are the default. Keep components as Server Components unless they need state, effects, or DOM event listeners.
- Add `"use client";` at the top of the file ONLY when creating Client Components.
- Push state down the tree: Wrap only the interactive parts in Client Components rather than the whole page.

## Data Fetching
- Fetch data directly in Server Components using `async/await`.
- Do not use `useEffect` for data fetching if it can be done on the server.
- For dynamic data that updates frequently, use `cache: "no-store"` in the `fetch` options to prevent stale data.
- Handle loading states with `loading.tsx` or `<Suspense fallback={...}>`.

## State Management
- Prefer local state (`useState`, `useReducer`) over global state libraries unless strictly necessary.
- Use the URL for global state (query parameters) when possible. It allows sharing URLs and native browser navigation.

## Styling (CSS Modules)
- Use **CSS Modules** (`[name].module.css`) for component-specific styles to avoid class name collisions.
- Use global CSS variables (`var(--accent)`, `var(--bg-surface)`) to maintain a cohesive design system (Dark mode, tokens).
- Create fluid, aesthetic animations using `@keyframes` and transitions.

## Performance & UX
- Use `next/image` for optimized images.
- Use `next/link` for client-side navigation.
- Implement **Optimistic UI** updates when mutating data to make the app feel faster.
- Provide clear visual feedback (spinners, skeletons, toast notifications) during async operations.
- Catch errors gracefully with `error.tsx` boundaries or try/catch blocks in handlers to avoid silent failures.

## Clean Code & TypeScript
- Strongly type your props and API responses using interfaces or types.
- Break large files into smaller, reusable components.
- Avoid deeply nested ternaries in JSX. Extract complex logic into helper functions or separate components.
