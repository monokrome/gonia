# Reactivity System

Gonia uses a fine-grained reactivity system inspired by Vue 3 and SolidJS. This guide explains how it works and how to use it effectively.

## Core Concepts

### Reactive State

The `reactive()` function creates a proxy that tracks property access and triggers updates when properties change:

```typescript
import { reactive } from 'gonia';

const state = reactive({
  count: 0,
  user: { name: 'Alice' }
});

// Reading properties is tracked
console.log(state.count); // 0

// Writing properties triggers updates
state.count = 1; // Dependents are notified
```

### Effects

The `effect()` function creates a reactive computation that re-runs when its dependencies change. It returns a cleanup function that stops the effect:

```typescript
import { reactive, effect } from 'gonia';

const state = reactive({ count: 0 });

const stop = effect(() => {
  console.log('Count is:', state.count);
});
// Logs: "Count is: 0"

state.count = 1;
// Logs: "Count is: 1"

stop(); // Remove the effect

state.count = 2;
// Nothing logged — effect was stopped
```

Effects automatically track which reactive properties they access and re-run only when those specific properties change.

## How Tracking Works

1. When an effect runs, it registers itself as the "active" effect
2. When a reactive property is read, the property records the active effect as a dependency
3. When the property is written, all dependent effects are scheduled to re-run

```typescript
const state = reactive({ a: 1, b: 2 });

effect(() => {
  // Only tracks 'a', not 'b'
  console.log(state.a);
});

state.a = 10; // Effect re-runs
state.b = 20; // Effect does NOT re-run
```

## Nested Objects

Reactive proxies are created lazily for nested objects:

```typescript
const state = reactive({
  user: {
    profile: {
      name: 'Alice'
    }
  }
});

effect(() => {
  console.log(state.user.profile.name);
});

// All these trigger the effect:
state.user.profile.name = 'Bob';
state.user.profile = { name: 'Charlie' };
state.user = { profile: { name: 'Dave' } };
```

## Arrays

Arrays are fully reactive:

```typescript
const state = reactive({
  items: ['a', 'b', 'c']
});

effect(() => {
  console.log('Items:', state.items.join(', '));
});

// These all trigger updates:
state.items.push('d');
state.items[0] = 'x';
state.items.splice(1, 1);
state.items = ['new', 'array'];
```

## Scoped State

In directives, `$scope` provides scoped reactive state:

```typescript
const myComponent: Directive = ($element, $scope) => {
  // $scope is a reactive object scoped to this element
  $scope.count = 0;

  effect(() => {
    $element.textContent = String($scope.count);
  });
};
```

Child elements inherit parent state through scope chains:

```typescript
// Parent directive
$scope.theme = 'dark';

// Child can access parent state
// <child-component g-text="theme"></child-component>
```

## Creating Scopes

Use `createScope()` for child scopes that inherit from parents. The child is a Proxy that delegates reads for unknown keys to the parent while keeping its own additions in a local reactive object:

```typescript
import { createScope, reactive } from 'gonia';

const parent = reactive({ items: [1, 2, 3] });
const child = createScope(parent, { item: 1, index: 0 });

child.item;   // 1 (from child's local additions)
child.items;  // [1, 2, 3] (delegated to parent)
```

This is the mechanism behind `g-for` — each loop iteration gets a child scope with its item/index variables while inheriting the parent's state.

## Effect Scopes

Group effects together for batch cleanup using `createEffectScope()`:

```typescript
import { createEffectScope, effect } from 'gonia';

const scope = createEffectScope();

scope.run(() => {
  effect(() => { /* ... */ });
  effect(() => { /* ... */ });
});

scope.active; // true — scope is running

// Later: cleanup all effects in the scope
scope.stop();

scope.active; // false — all effects removed
```

The `EffectScope` interface:

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `run(fn)` | `<T>(fn: () => T) => T` | Run function within this scope, capturing effects |
| `stop()` | `() => void` | Dispose all effects created within this scope |
| `active` | `boolean` | Whether the scope is still active |

This is useful for directives that create multiple effects and need to clean them up when the element is removed.

## Computed Properties

Create derived values using `Object.defineProperty` with getters:

```typescript
const state = reactive({
  items: [],
  filter: 'all'
});

// Computed property
Object.defineProperty(state, 'filteredItems', {
  get() {
    if (state.filter === 'all') return state.items;
    return state.items.filter(item => item.type === state.filter);
  },
  enumerable: true
});

effect(() => {
  // Re-runs when items OR filter changes
  console.log(state.filteredItems);
});
```

## Best Practices

### 1. Keep State Flat When Possible

```typescript
// Prefer
const state = reactive({
  userName: 'Alice',
  userAge: 30
});

// Over deeply nested
const state = reactive({
  user: { profile: { name: 'Alice', age: 30 } }
});
```

### 2. Batch Updates

Multiple synchronous updates are batched:

```typescript
const state = reactive({ a: 1, b: 2 });

effect(() => {
  console.log(state.a, state.b);
});

// These trigger only ONE effect re-run
state.a = 10;
state.b = 20;
```

### 3. Avoid Side Effects in Getters

```typescript
// Bad - side effect in getter
Object.defineProperty(state, 'count', {
  get() {
    someGlobalCounter++; // Side effect!
    return this._count;
  }
});

// Good - pure getter
Object.defineProperty(state, 'count', {
  get() {
    return this._count;
  }
});
```

### 4. Clean Up Effects

Always clean up effects when they're no longer needed:

```typescript
const scope = createEffectScope();

// When component mounts
scope.run(() => {
  effect(() => { /* ... */ });
});

// When component unmounts
scope.stop();
```

## Debugging

Track reactive dependencies by logging in effects:

```typescript
effect(() => {
  console.log('Effect running, count is:', state.count);
});
```

For complex debugging, you can inspect the reactive proxy:

```typescript
import { reactive } from 'gonia';

const state = reactive({ count: 0 });
console.log(state); // Proxy object
console.log({ ...state }); // Plain object snapshot
```
