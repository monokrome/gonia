# Directives Reference

Directives are special attributes that add reactive behavior to HTML elements. Gonia provides several built-in directives.

## Text Directives

### g-text

Sets the text content of an element.

```html
<span g-text="message"></span>
<p g-text="user.name"></p>
<div g-text="'Hello, ' + name"></div>
```

The expression is evaluated and the result is set as the element's `textContent`. HTML is escaped automatically.

### g-html

Sets the inner HTML of an element (use with caution).

```html
<div g-html="richContent"></div>
```

**Warning:** Only use with trusted content to avoid XSS vulnerabilities.

## Conditional Directives

### g-show

Toggles element visibility using `display: none`.

```html
<div g-show="isVisible">This can be hidden</div>
<p g-show="items.length > 0">Items exist</p>
```

The element remains in the DOM but is hidden when the expression is falsy.

### g-if

Conditionally renders an element. When false, the element is removed from the DOM.

```html
<p g-if="hasError">An error occurred</p>
<div g-if="user">Welcome, <span g-text="user.name"></span></div>
```

Unlike `g-show`, `g-if` completely removes the element when the condition is false.

## Loop Directive

### g-for

Iterates over arrays or objects to render multiple elements.

**Array iteration:**
```html
<li g-for="item in items" g-text="item"></li>
<li g-for="(item, index) in items" g-text="index + ': ' + item"></li>
```

**Object iteration:**
```html
<li g-for="(value, key) in object" g-text="key + ': ' + value"></li>
```

**Built-in loop variables:**
- `$index` - Current index (0-based)
- `$first` - True if first item
- `$last` - True if last item
- `$even` - True if even index
- `$odd` - True if odd index

```html
<li g-for="item in items" g-class="{ first: $first, last: $last }">
  <span g-text="item"></span>
</li>
```

## Class Directive

### g-class

Dynamically adds or removes CSS classes.

```html
<div g-class="{ active: isActive, disabled: isDisabled }">
  Conditional classes
</div>

<button g-class="{ 'btn-primary': isPrimary, 'btn-lg': isLarge }">
  Click me
</button>
```

The expression should evaluate to an object where keys are class names and values are booleans.

## Form Directives

### g-model

Two-way data binding for form inputs.

**Text input:**
```html
<input type="text" g-model="name">
```

**Checkbox:**
```html
<input type="checkbox" g-model="isChecked">
```

**Select:**
```html
<select g-model="selected">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

**Textarea:**
```html
<textarea g-model="content"></textarea>
```

## Event Directive

### g-on

Attaches event listeners to elements.

```html
<button g-on="click: handleClick">Click me</button>
<form g-on="submit: handleSubmit">...</form>
<input g-on="input: handleInput">
```

The expression after the colon is evaluated when the event fires. If it evaluates to a function, that function is called with the event object.

```typescript
// In your directive
$scope.handleClick = (event: Event) => {
  console.log('Clicked!', event);
};

$scope.increment = () => {
  $scope.count++;
};
```

## Scope Directive

### g-scope

Initializes scope values inline on any element.

```html
<div g-scope="{ count: 0, message: 'Hello' }">
  <span g-text="message"></span>
  <span g-text="count"></span>
</div>
```

The expression is evaluated and merged into the current scope. Useful for initializing local state without creating a custom directive.

## Attribute Binding

### g-bind:*

Dynamically binds an expression to any HTML attribute.

```html
<a g-bind:href="linkUrl">Click here</a>
<img g-bind:src="imageUrl" g-bind:alt="imageAlt">
<input g-bind:disabled="isDisabled">
<div g-bind:data-id="item.id">...</div>
```

When the expression is `null` or `undefined`, the attribute is removed. Otherwise, the value is converted to a string.

**Dynamic classes and styles:**
```html
<div g-bind:class="dynamicClass">...</div>
<div g-bind:style="'color: ' + textColor">...</div>
```

## Templates

Templates let directives define their HTML structure. The `template` directive option accepts a string or a function and supports slots for content projection.

### Static Templates

Pass a string to render fixed HTML:

```typescript
directive('my-card', ($scope) => {
  $scope.title = 'Default Title';
}, {
  scope: true,
  template: '<div class="card"><slot></slot></div>'
});
```

### Template Functions

Pass a function to generate HTML dynamically from the element's attributes:

```typescript
directive('fancy-heading', null, {
  template: ({ level, children }) => `<h${level}>${children}</h${level}>`
});
```

The function receives a `TemplateAttrs` object:
- `children` — the element's innerHTML before template transformation
- All other keys are the element's HTML attributes

```html
<fancy-heading level="2">Section Title</fancy-heading>
<!-- renders: <h2>Section Title</h2> -->
```

### Async Templates

Template functions can return a `Promise<string>` for lazy loading:

```typescript
directive('lazy-widget', handler, {
  template: () => import('./widget.html?raw').then(m => m.default)
});
```

### Template-Only Directives

Pass `null` as the directive function to create directives with no runtime behavior — pure templates:

```typescript
directive('fancy-heading', null, {
  template: ({ level, children }) => `<h${level}>${children}</h${level}>`
});
```

### g-template

Loads a template by name at runtime from a template registry. Children are saved for slot transclusion before the template replaces the element's content.

```html
<div g-template="dialog">
  <span slot="header">My Dialog Title</span>
  <p>Dialog body content goes here.</p>
</div>
```

The `$templates` injectable provides access to the registry. Templates can be sourced from inline `<template>` tags, fetched files, or in-memory maps.

**Template registries:**

```typescript
import { createTemplateRegistry, createMemoryRegistry, createServerRegistry } from 'gonia';

// Browser: inline <template> tags with fetch fallback
const templates = createTemplateRegistry({ basePath: '/templates/' });

// Testing / bundled: in-memory map
const templates = createMemoryRegistry({
  dialog: '<div class="dialog"><slot name="header"></slot><slot></slot></div>',
  card: '<div class="card"><slot></slot></div>'
});

// Server: read from filesystem
import { readFile } from 'fs/promises';
const templates = createServerRegistry(
  (path) => readFile(path, 'utf-8'),
  './templates/'
);
```

## Slots

Slots are placeholders in templates that receive content from the element using the template. They enable composition by letting parent content project into child templates.

### Default Slot

Any child content without a `slot` attribute goes into the default slot:

```typescript
directive('my-card', null, {
  template: '<div class="card"><slot></slot></div>'
});
```

```html
<my-card>
  <p>This goes into the default slot.</p>
</my-card>
<!-- renders: <div class="card"><p>This goes into the default slot.</p></div> -->
```

### Named Slots

Use `<slot name="...">` in templates and `slot="..."` on child elements to target specific slots:

```typescript
directive('my-layout', null, {
  template: `
    <header><slot name="header"></slot></header>
    <main><slot></slot></main>
    <footer><slot name="footer"></slot></footer>
  `
});
```

```html
<my-layout>
  <h1 slot="header">Page Title</h1>
  <p>Main content goes to the default slot.</p>
  <span slot="footer">Copyright 2026</span>
</my-layout>
```

### g-slot Directive

Use `g-slot` for dynamic slot names driven by expressions:

```html
<!-- Static slot (equivalent to <slot name="header"></slot>) -->
<div g-slot="'header'"></div>

<!-- Dynamic slot name from scope -->
<slot g-slot="activeTab"></slot>
```

When `g-slot` has an expression, it wraps in a reactive effect so the slot content updates when the expression changes.

### How Slot Extraction Works

When a template is applied to an element:
1. Children with a `slot="name"` attribute are collected into the named slot
2. All other children go into the `default` slot
3. `<slot>` elements (or `g-slot` directives) in the template are replaced with the matching content

## Directive Options

When registering a directive with `directive()`, the third argument is an options object:

```typescript
directive('my-component', handler, { scope: true, template: '...' });
```

| Option | Type | Description |
|--------|------|-------------|
| `scope` | `boolean` | Create an isolated reactive scope. Required for component-style directives. |
| `template` | `string \| (attrs, el) => string` | HTML template — static string or function receiving `TemplateAttrs`. |
| `provide` | `Record<string, unknown>` | DI provider overrides for descendant directives. |
| `assign` | `Record<string, unknown>` | Values merged into the directive's scope. Requires `scope: true`. |
| `using` | `ContextKey[]` | Context keys this directive depends on (resolved from ancestors). |
| `fallback` | `string \| (attrs, el) => string` | Fallback content for async directives. See [Async Rendering](./async-rendering.md). |
| `ssr` | `'await' \| 'fallback' \| 'stream'` | SSR mode for async directives. See [Async Rendering](./async-rendering.md). |

### scope

Creates an isolated reactive scope that inherits from the parent via prototype chain. Required for directives that manage their own state:

```typescript
directive('counter', ($scope) => {
  $scope.count = 0;
  $scope.increment = () => $scope.count++;
}, { scope: true });
```

### provide

Overrides DI values for all descendant directives. Useful for theming, testing with mocks, or scoping services to a subtree:

```typescript
directive('test-harness', null, {
  scope: true,
  provide: {
    '$http': mockHttpClient,
    'apiUrl': 'http://localhost:3000/test'
  }
});

// Descendants receive the mock values
directive('api-consumer', ($http, apiUrl) => {
  $http.get(apiUrl + '/users');
});
```

### assign

Merges values into the directive's scope, making them available in template expressions. Requires `scope: true`:

```typescript
import styles from './button.module.css';

directive('my-button', handler, {
  scope: true,
  assign: { $styles: styles }
});
```

```html
<my-button>
  <div g-class="$styles.container">...</div>
</my-button>
```

## Context (Provider / Consumer)

Context lets ancestor directives share data with descendants through the DOM tree without passing through every intermediate element.

### $context — Exposing Scope to Descendants

When a directive declares `$context`, its scope values become available to descendant directives under those names:

```typescript
const themeProvider: Directive = ($scope) => {
  $scope.mode = 'dark';
  $scope.toggle = () => {
    $scope.mode = $scope.mode === 'dark' ? 'light' : 'dark';
  };
};
themeProvider.$context = ['theme'];

directive('theme-provider', themeProvider, { scope: true });
```

Descendants can inject the context by name:

```typescript
const themedButton: Directive = ($element, theme) => {
  $element.className = theme.mode;
};

directive('themed-button', themedButton);
```

### Typed Context Keys

For type-safe context, use `createContextKey<T>()` with the `using` directive option:

```typescript
import { createContextKey, directive } from 'gonia';

const ThemeContext = createContextKey<{ mode: 'light' | 'dark' }>('Theme');

directive('themed-widget', ($element, $scope, theme) => {
  $element.className = theme.mode;
}, {
  using: [ThemeContext]
});
```

The `using` array declares which context keys the directive depends on. Resolved values are appended to the directive function parameters in order.

### How Resolution Works

When a directive requests a context value (either by name via `$context` or by key via `using`), Gonia walks up the DOM tree from the element to find the nearest ancestor that provides it. This is similar to React's Context or Vue's provide/inject.

## configureDirective

Modify options on an existing or not-yet-registered directive without access to the directive function:

```typescript
import { configureDirective } from 'gonia';

// Add a template to a third-party directive
configureDirective('app-header', {
  template: '<header><slot></slot></header>'
});

// Override options on a built-in directive
configureDirective('g-text', { scope: true });
```

If the directive hasn't been registered yet, the options are stored and merged when it is registered.

## Creating Custom Directives

You can create custom directives for reusable behavior:

```typescript
import { directive, Directive, Expression, EvalFn } from 'gonia';
import { effect } from 'gonia';

const highlight: Directive = ($expr, $element, $eval) => {
  effect(() => {
    const color = $eval<string>($expr);
    ($element as HTMLElement).style.backgroundColor = color || '';
  });
};

directive('g-highlight', highlight);
```

Usage:
```html
<div g-highlight="highlightColor">Highlighted content</div>
```

## Directive Priority

Directives are processed in priority order. Built-in priorities:

| Priority | Directives |
|----------|------------|
| 1000 (STRUCTURAL) | `g-for`, `g-if` |
| 0 (NORMAL) | All others |

Structural directives run first because they may modify the DOM structure.

## Dependency Injection

### What is Dependency Injection?

Dependency injection (DI) is a pattern where a function declares what it
needs by name, and the framework provides those values as arguments. When
you write `($scope, $element) => { ... }`, you're asking for two specific
things — the reactive scope and the DOM element — by their registered
names. The framework looks up each name, resolves the corresponding
value, and passes it in.

This has two practical benefits:

- **Decoupling** — your directive doesn't know or care where `$scope` or
  `$element` come from. It just declares what it needs and the framework
  provides it.
- **Testability** — in tests, you pass mock objects directly. No framework
  setup needed to test business logic.

### How it Works in Gonia

Name your function parameters after the dependencies you need. The
framework matches parameter names and passes the corresponding values:

```typescript
const counter: Directive = ($scope, $element) => {
  $scope.count = 0;
  $element.addEventListener('click', () => $scope.count++);
};
```

**Injection is name-based, not positional.** You list only what you need,
in any order:

```typescript
// These are equivalent — order doesn't matter
const a: Directive = ($scope, $element) => { ... };
const b: Directive = ($element, $scope) => { ... };

// Only need one dependency? Just ask for it
const c: Directive = ($scope) => { ... };
```

### How DI Works at Build Time

Minifiers rename function parameters, which breaks name-based injection.
The Gonia Vite plugin solves this automatically — it scans your
`directive()` calls, reads the parameter names from the function
declaration, and generates `$inject` arrays at build time via
`transformInject()`.

For example, this source code:

```typescript
const counter: Directive = ($scope, $element) => {
  $scope.count = 0;
};

directive('my-counter', counter, { scope: true });
```

Is transformed at build time to:

```typescript
const counter: Directive = ($scope, $element) => {
  $scope.count = 0;
};

counter.$inject = ['$scope', '$element'];
directive('my-counter', counter, { scope: true });
```

**You don't need to write `$inject` arrays yourself.** The Vite plugin
handles it. If you're not using the Vite plugin (e.g., in a plain Node.js
script), add them manually:

```typescript
counter.$inject = ['$scope', '$element'];
```

### Available Injectables

| Name          | Description                              |
|---------------|------------------------------------------|
| `$expr`       | The directive's attribute value          |
| `$element`    | The target DOM element                   |
| `$eval`       | Function to evaluate expressions         |
| `$scope`      | Local reactive state object              |
| `$rootState`  | Root reactive state (shared across tree) |
| `$mode`       | Current mode (`'server'` or `'client'`)  |
| `$templates`  | Template registry for `g-template`       |
| `$fallback`   | Trigger fallback rendering (`() => never`) — see [Async Rendering](./async-rendering.md) |

Custom dependencies can be provided via the `provide` directive option
and resolved by descendant directives.

### Testing with DI

Because directives receive dependencies as arguments, testing is
straightforward — pass mocks directly:

```typescript
import { describe, it, expect } from 'vitest';

describe('highlight directive', () => {
  it('sets background color', () => {
    const el = document.createElement('div');
    const evalFn = () => 'red';

    highlight('color' as Expression, el, evalFn);

    expect(el.style.backgroundColor).toBe('red');
  });
});
```

No framework setup needed. The directive is just a function.
