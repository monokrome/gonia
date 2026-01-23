# Gonia

A lightweight, SSR-first reactive UI library for building web applications with HTML-based templates and declarative directives.

## Features

- **SSR-First Architecture** - Server-side rendering with seamless client hydration
- **Declarative Directives** - Vue-inspired template syntax (`c-text`, `c-for`, `c-if`, etc.)
- **Fine-Grained Reactivity** - Efficient updates without virtual DOM diffing
- **Zero Dependencies** - Core library has no runtime dependencies (linkedom for SSR only)
- **TypeScript Native** - Full type safety with excellent IDE support

## Installation

```bash
pnpm add gonia
```

## Quick Start

### Server-Side Rendering

```typescript
import { render, registerDirective } from 'gonia/server';
import { text, show, cfor, cif, cclass } from 'gonia';

// Create directive registry
const registry = new Map();
registerDirective(registry, 'text', text);
registerDirective(registry, 'show', show);
registerDirective(registry, 'for', cfor);
registerDirective(registry, 'if', cif);
registerDirective(registry, 'class', cclass);

// Render HTML with state
const html = await render(
  '<ul><li c-for="item in items" c-text="item"></li></ul>',
  { items: ['Apple', 'Banana', 'Cherry'] },
  registry
);
```

### Client-Side Hydration

```typescript
import { hydrate } from 'gonia/client';
import { directive } from 'gonia';

// Import directives (registers globally)
import './directives/my-app.js';

// Hydrate when DOM is ready
hydrate();
```

### Creating a Component Directive

```typescript
import { directive, Directive } from 'gonia';

const myApp: Directive = ($element, $state) => {
  // Initialize state
  $state.count = 0;

  // Define methods
  $state.increment = () => {
    $state.count++;
  };
};

myApp.$inject = ['$element', '$state'];

// Register with scope: true to create isolated state
directive('my-app', myApp, { scope: true });
```

```html
<my-app>
  <p c-text="count"></p>
  <button c-on="click: increment">+1</button>
</my-app>
```

## Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `c-text` | Set text content | `<span c-text="message"></span>` |
| `c-show` | Toggle visibility | `<div c-show="isVisible">...</div>` |
| `c-if` | Conditional render | `<p c-if="hasError">Error!</p>` |
| `c-for` | Loop iteration | `<li c-for="item in items">...</li>` |
| `c-class` | Dynamic classes | `<div c-class="{ active: isActive }">` |
| `c-model` | Two-way binding | `<input c-model="name">` |
| `c-on` | Event handling | `<button c-on="click: handleClick">` |

## Vite Integration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { gonia } from 'gonia/vite';

export default defineConfig({
  plugins: [gonia()]
});
```

## Documentation

See the [docs](./docs) folder for detailed documentation:

- [Getting Started](./docs/getting-started.md)
- [Directives Reference](./docs/directives.md)
- [SSR Guide](./docs/ssr.md)
- [Reactivity](./docs/reactivity.md)

## License

MIT
