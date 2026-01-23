# Server-Side Rendering

Gonia is designed with SSR as a first-class feature. This guide covers how SSR works and best practices for implementing it.

## How SSR Works

1. **Server renders HTML** - The `render()` function processes directives and outputs static HTML
2. **Browser receives HTML** - Users see content immediately without waiting for JavaScript
3. **Client hydrates** - JavaScript attaches event handlers and enables reactivity
4. **App becomes interactive** - State changes now update the DOM reactively

## Basic SSR Setup

```typescript
import { render, registerDirective } from 'gonia/server';
import { text, show, cfor, cif, cclass } from 'gonia';

// Create and populate registry
const registry = new Map();
registerDirective(registry, 'text', text);
registerDirective(registry, 'show', show);
registerDirective(registry, 'for', cfor);
registerDirective(registry, 'if', cif);
registerDirective(registry, 'class', cclass);

// Initial state for SSR
const state = {
  title: 'My App',
  items: ['Item 1', 'Item 2', 'Item 3']
};

// Render HTML
const html = await render(template, state, registry);
```

## SSR Output Format

### c-for Template Elements

The `c-for` directive outputs a `<template>` element containing the loop template, followed by rendered items:

```html
<!-- Input -->
<li c-for="item in items" c-text="item"></li>

<!-- SSR Output -->
<template c-for="item in items">
  <li data-c-for-template c-text="item"></li>
</template>
<li data-c-for-processed c-text="item">Item 1</li>
<li data-c-for-processed c-text="item">Item 2</li>
<li data-c-for-processed c-text="item">Item 3</li>
```

The `<template>` element is used by the client during hydration to:
1. Find the loop template
2. Remove SSR-rendered items
3. Set up reactive rendering

### c-if Conditional Rendering

When `c-if` is false, the element is not included in SSR output:

```html
<!-- Input with showError = false -->
<p c-if="showError">Error message</p>

<!-- SSR Output -->
<!-- Element not rendered -->
```

### c-show Display State

The `c-show` directive sets inline display style:

```html
<!-- Input with visible = false -->
<div c-show="visible">Content</div>

<!-- SSR Output -->
<div c-show="visible" style="display:none">Content</div>
```

## Hydration

On the client, hydration connects the SSR HTML to the reactive system:

```typescript
import { hydrate } from 'gonia/client';

// Hydrate after DOM is ready
hydrate();
```

### What Hydration Does

1. **Finds directive elements** - Scans DOM for `c-*` attributes
2. **Processes structural directives** - Sets up `c-for` and `c-if` reactivity
3. **Attaches event handlers** - Connects `c-on` directives
4. **Enables reactivity** - Wraps state in reactive proxies

### Hydration Does NOT

- Re-render content that matches server state
- Cause visible flicker or layout shifts
- Duplicate list items from `c-for`

## State Synchronization

For proper hydration, client state should match server state:

```typescript
// Server
const serverState = { count: 0, items: ['a', 'b'] };
const html = await render(template, serverState, registry);

// Client
const clientState = reactive({ count: 0, items: ['a', 'b'] });
// State matches, so no visual changes during hydration
```

## SSR with Express

```typescript
import express from 'express';
import { render, registerDirective } from 'gonia/server';
import { text, cfor } from 'gonia';

const app = express();
const registry = new Map();
registerDirective(registry, 'text', text);
registerDirective(registry, 'for', cfor);

app.get('/', async (req, res) => {
  const state = await fetchData();
  const html = await render(template, state, registry);

  res.send(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="app">${html}</div>
        <script type="module" src="/main.js"></script>
      </body>
    </html>
  `);
});

app.listen(3000);
```

## Static Site Generation

Gonia can be used for SSG by rendering HTML at build time:

```typescript
import { writeFileSync } from 'fs';
import { render, registerDirective } from 'gonia/server';

async function build() {
  const registry = setupRegistry();

  const pages = [
    { path: '/index.html', state: { title: 'Home' } },
    { path: '/about.html', state: { title: 'About' } },
  ];

  for (const page of pages) {
    const html = await render(template, page.state, registry);
    writeFileSync(`dist${page.path}`, wrapHtml(html));
  }
}

build();
```

## Best Practices

### 1. Keep Initial State Minimal

Only include data needed for initial render:

```typescript
// Good - minimal initial state
const state = { items: await fetchVisibleItems() };

// Avoid - loading everything upfront
const state = { items: await fetchAllItems(), user: await getUser(), ... };
```

### 2. Handle Loading States

Show loading indicators for data that loads after hydration:

```html
<div c-if="isLoading">Loading...</div>
<div c-if="!isLoading" c-for="item in items">...</div>
```

### 3. Avoid SSR-Only Code in Client Bundles

Use conditional imports or separate entry points:

```typescript
// server-only.ts - not bundled for client
import { render } from 'gonia/server';
```

### 4. Test SSR Output

Verify SSR produces correct HTML:

```typescript
import { render } from 'gonia/server';

test('renders list items', async () => {
  const html = await render(template, { items: ['a', 'b'] }, registry);
  expect(html).toContain('>a</li>');
  expect(html).toContain('>b</li>');
});
```
