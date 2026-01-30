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

highlight.$inject = ['$expr', '$element', '$eval'];

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

### Minification Note

Minifiers rename function parameters, which breaks name-based injection.
The gonia Vite plugin handles this automatically by adding `$inject`
arrays at build time. If you're not using the Vite plugin, add them
manually:

```typescript
const counter: Directive = ($scope, $element) => { ... };
counter.$inject = ['$scope', '$element'];
```
