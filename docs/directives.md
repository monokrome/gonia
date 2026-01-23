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
