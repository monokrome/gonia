# Gonia

A lightweight, SSR-first reactive UI library for building web applications with HTML-based templates and declarative directives.

## Features

- **SSR-First Architecture** - Server-side rendering with seamless client hydration
- **Declarative Directives** - Vue-inspired template syntax (`g-text`, `g-for`, `g-if`, etc.)
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
  '<ul><li g-for="item in items" g-text="item"></li></ul>',
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
  <p g-text="count"></p>
  <button g-on="click: increment">+1</button>
</my-app>
```

## Directives

| Directive | Description | Example |
|-----------|-------------|---------|
| `g-text` | Set text content | `<span g-text="message"></span>` |
| `g-show` | Toggle visibility | `<div g-show="isVisible">...</div>` |
| `g-if` | Conditional render | `<p g-if="hasError">Error!</p>` |
| `g-for` | Loop iteration | `<li g-for="item in items">...</li>` |
| `g-class` | Dynamic classes | `<div g-class="{ active: isActive }">` |
| `g-model` | Two-way binding | `<input g-model="name">` |
| `g-on` | Event handling | `<button g-on="click: handleClick">` |

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
