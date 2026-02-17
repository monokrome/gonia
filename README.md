# Gonia

A lightweight, SSR-first reactive UI library for building web applications with HTML-based templates and declarative directives.

## Features

- **[SSR-First Architecture](./docs/ssr.md)** - Server-side rendering with seamless client hydration
- **[Declarative Directives](./docs/directives.md)** - Vue-inspired template syntax (`g-text`, `g-for`, `g-if`, etc.)
- **[Fine-Grained Reactivity](./docs/reactivity.md)** - Efficient updates without virtual DOM diffing
- **Minimal Dependencies** - Core library has no runtime dependencies (happy-dom for SSR only)
- **TypeScript Native** - Full type safety with excellent IDE support

## Installation

```bash
pnpm add gonia
```

## Quick Start

### Server-Side Rendering

```typescript
import { render } from 'gonia/server';

// Importing directives registers them globally via directive()
import 'gonia/directives';

// Render HTML with state — globally registered directives are discovered automatically
const html = await render(
  '<ul><li g-for="item in items" g-text="item"></li></ul>',
  { items: ['Apple', 'Banana', 'Cherry'] },
  new Map()
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

Directives receive their dependencies through [dependency injection](./docs/directives.md#dependency-injection) — parameter names like `$element` and `$scope` tell the framework what to provide:

```typescript
import { directive, Directive } from 'gonia';

const myApp: Directive<['$element', '$scope']> = ($element, $scope) => {
  // Initialize scope
  $scope.count = 0;

  // Define methods
  $scope.increment = () => {
    $scope.count++;
  };
};

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
| `g-scope` | Inline scope init | `<div g-scope="{ count: 0 }">` |
| `g-bind:*` | Dynamic attributes | `<a g-bind:href="link">` |
| `g-template` | Load named template | `<div g-template="dialog">` |
| `g-slot` | Content slot projection | `<slot g-slot="activeTab">` |

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
- [Async Rendering](./docs/async-rendering.md)
- [Reactivity](./docs/reactivity.md)

## Roadmap

### Done
- [x] Core directives (`g-text`, `g-show`, `g-if`, `g-for`, `g-class`, `g-model`, `g-on`, `g-scope`, `g-bind:*`, `g-html`)
- [x] Template directives (`g-template`, `g-slot`, slot content projection)
- [x] Directive options (`scope`, `template`, `assign`, `provide`, `using`)
- [x] SSR with client hydration
- [x] Vite plugin with `$inject` transformation
- [x] Typed context registry
- [x] Persistent scopes for `g-if` toggles
- [x] Async directives with suspense boundaries (`fallback`, `ssr` modes, streaming)

### Planned
- [ ] Reducer-based two-way bindings (`scope: { prop: '=' }`)
- [ ] Scoped CSS with automatic class mangling
- [ ] Browser devtools extension
- [ ] Transition system for `g-if`/`g-for`

## License

MIT
