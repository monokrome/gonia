# Directives Reference

Directives are special attributes that add reactive behavior to HTML elements. Gonia provides several built-in directives.

## Text Directives

### c-text

Sets the text content of an element.

```html
<span c-text="message"></span>
<p c-text="user.name"></p>
<div c-text="'Hello, ' + name"></div>
```

The expression is evaluated and the result is set as the element's `textContent`. HTML is escaped automatically.

### c-html

Sets the inner HTML of an element (use with caution).

```html
<div c-html="richContent"></div>
```

**Warning:** Only use with trusted content to avoid XSS vulnerabilities.

## Conditional Directives

### c-show

Toggles element visibility using `display: none`.

```html
<div c-show="isVisible">This can be hidden</div>
<p c-show="items.length > 0">Items exist</p>
```

The element remains in the DOM but is hidden when the expression is falsy.

### c-if

Conditionally renders an element. When false, the element is removed from the DOM.

```html
<p c-if="hasError">An error occurred</p>
<div c-if="user">Welcome, <span c-text="user.name"></span></div>
```

Unlike `c-show`, `c-if` completely removes the element when the condition is false.

## Loop Directive

### c-for

Iterates over arrays or objects to render multiple elements.

**Array iteration:**
```html
<li c-for="item in items" c-text="item"></li>
<li c-for="(item, index) in items" c-text="index + ': ' + item"></li>
```

**Object iteration:**
```html
<li c-for="(value, key) in object" c-text="key + ': ' + value"></li>
```

**Built-in loop variables:**
- `$index` - Current index (0-based)
- `$first` - True if first item
- `$last` - True if last item
- `$even` - True if even index
- `$odd` - True if odd index

```html
<li c-for="item in items" c-class="{ first: $first, last: $last }">
  <span c-text="item"></span>
</li>
```

## Class Directive

### c-class

Dynamically adds or removes CSS classes.

```html
<div c-class="{ active: isActive, disabled: isDisabled }">
  Conditional classes
</div>

<button c-class="{ 'btn-primary': isPrimary, 'btn-lg': isLarge }">
  Click me
</button>
```

The expression should evaluate to an object where keys are class names and values are booleans.

## Form Directives

### c-model

Two-way data binding for form inputs.

**Text input:**
```html
<input type="text" c-model="name">
```

**Checkbox:**
```html
<input type="checkbox" c-model="isChecked">
```

**Select:**
```html
<select c-model="selected">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

**Textarea:**
```html
<textarea c-model="content"></textarea>
```

## Event Directive

### c-on

Attaches event listeners to elements.

```html
<button c-on="click: handleClick">Click me</button>
<form c-on="submit: handleSubmit">...</form>
<input c-on="input: handleInput">
```

The expression after the colon is evaluated when the event fires. If it evaluates to a function, that function is called with the event object.

```typescript
// In your directive
$state.handleClick = (event: Event) => {
  console.log('Clicked!', event);
};

$state.increment = () => {
  $state.count++;
};
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

directive('c-highlight', highlight);
```

Usage:
```html
<div c-highlight="highlightColor">Highlighted content</div>
```

## Directive Priority

Directives are processed in priority order. Built-in priorities:

| Priority | Directives |
|----------|------------|
| 1000 (STRUCTURAL) | `c-for`, `c-if` |
| 0 (NORMAL) | All others |

Structural directives run first because they may modify the DOM structure.

## Dependency Injection

Directives can inject various dependencies:

| Injectable | Description |
|------------|-------------|
| `$expr` | The directive's attribute value |
| `$element` | The DOM element |
| `$eval` | Function to evaluate expressions |
| `$state` | Local reactive state object |
| `$mode` | Current mode (SERVER or CLIENT) |

```typescript
const myDirective: Directive = ($expr, $element, $eval, $state, $mode) => {
  // Use injected dependencies
};

myDirective.$inject = ['$expr', '$element', '$eval', '$state', '$mode'];
```
