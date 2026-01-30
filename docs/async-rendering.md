# Async Rendering

Async directives let you write directive functions that fetch data or perform other async operations. Gonia handles the async lifecycle on both server and client, including fallback content while loading.

## Basic Usage

Register an async directive with `directive()`, providing a `fallback` and `template`:

```typescript
import { directive } from 'gonia';

directive('user-profile', async ($scope) => {
  $scope.user = await fetchUser($scope.userId);
}, {
  fallback: '<p>Loading profile...</p>',
  template: ({ children }) => `
    <h2>${children}</h2>
  `,
});
```

```html
<user-profile user-id="42">
  <!-- fallback shown until async fn resolves -->
</user-profile>
```

The `fallback` option is required for async directives that need SSR support. Without it, the directive behaves like a regular async function (awaited on server, awaited on client).

## SSR Modes

The `ssr` option controls how the server handles async directives. Set it in directive options:

```typescript
directive('my-widget', asyncFn, {
  fallback: '<p>Loading...</p>',
  template: '<div>...</div>',
  ssr: 'await', // 'await' | 'fallback' | 'stream'
});
```

| Mode | Server behavior | Client behavior | Use when |
|------|----------------|-----------------|----------|
| `await` (default) | Runs the async fn, waits, renders template | Hydrates the pre-rendered result | Data is fast and critical for SEO |
| `fallback` | Renders fallback without running fn | Runs fn, swaps to template | Data is slow or non-critical |
| `stream` | Renders fallback, streams replacement later | Hydrates streamed result | Progressive loading with `renderStream()` |

### `await` mode

The server runs the async function, waits for it to resolve, then renders the template. The client receives fully rendered HTML.

```typescript
directive('product-card', async ($scope) => {
  $scope.product = await db.getProduct($scope.id);
}, {
  fallback: '<div>Loading product...</div>',
  template: (attrs) => `<div>${attrs['data-name']}</div>`,
  ssr: 'await',
});
```

If the function throws or times out, the server renders the fallback instead. The client will re-attempt loading.

### `fallback` mode

The server skips the async function entirely and renders the fallback. The client loads the data after hydration.

```typescript
directive('comment-thread', async ($scope) => {
  $scope.comments = await api.getComments($scope.postId);
}, {
  fallback: '<p>Loading comments...</p>',
  template: (attrs) => `<ul>${attrs.children}</ul>`,
  ssr: 'fallback',
});
```

This is useful for non-critical content that would slow down initial page load.

### `stream` mode

The server renders the fallback immediately, then streams a replacement `<script>` tag when the async function resolves. Requires `renderStream()`.

```typescript
directive('live-stats', async ($scope) => {
  $scope.stats = await analytics.getStats();
}, {
  fallback: '<div>Loading stats...</div>',
  template: (attrs) => `<div>${attrs.children}</div>`,
  ssr: 'stream',
});
```

## `$fallback` Injectable

Directives can request fallback rendering programmatically by injecting `$fallback`. This is a function typed `() => never` — calling it throws a `FallbackSignal` that the framework catches.

```typescript
directive('conditional-data', async ($scope, $fallback) => {
  const data = await fetchData();
  if (!data.isReady) {
    $fallback(); // renders fallback, stops execution
  }
  $scope.data = data;
}, {
  fallback: '<p>Not ready yet</p>',
  template: '<div>...</div>',
});
```

`$fallback()` never returns — it throws internally. This means code after `$fallback()` is unreachable, which TypeScript understands via the `() => never` type.

**Important:** Avoid bare `catch {}` blocks around code that might call `$fallback()`. A bare catch swallows the `FallbackSignal` and prevents the framework from rendering the fallback. If you need error handling, re-throw unknown errors:

```typescript
try {
  await riskyOperation();
} catch (e) {
  if (e instanceof FallbackSignal) throw e;
  handleError(e);
}
```

Or better, use `$fallback()` outside the try/catch.

## Function Fallbacks

The `fallback` option can be a function that receives the element's attributes, allowing dynamic fallback content:

```typescript
directive('user-card', async ($scope) => {
  $scope.user = await fetchUser($scope.id);
}, {
  fallback: (attrs) => `<p>Loading ${attrs['display-name'] ?? 'user'}...</p>`,
  template: '<div>...</div>',
});
```

```html
<user-card id="42" display-name="Alice"></user-card>
<!-- fallback: <p>Loading Alice...</p> -->
```

The function receives a `TemplateAttrs` object with all element attributes plus a `children` key containing the element's innerHTML.

## Safety: Depth and Timeout

In `await` mode, recursive or deeply nested async directives could cause infinite loops. Two safety mechanisms prevent this:

### `maxDepth`

Limits how many levels of nested async directives the server will await. Default is 10. When exceeded, the fallback is rendered instead.

```typescript
import { render } from 'gonia/server';

const html = await render(template, state, registry, {
  maxDepth: 5,
});
```

### `timeout`

A global timeout for the entire render pass. If exceeded, any remaining async directives render their fallback.

```typescript
const html = await render(template, state, registry, {
  timeout: 3000, // 3 seconds
});
```

Both options are set via `RenderOptions` passed to `render()` or `renderStream()`.

## Streaming

`renderStream()` returns a `ReadableStream<string>` for progressive HTML delivery. It works with `stream` mode async directives:

```typescript
import { renderStream } from 'gonia/server';

const stream = renderStream(template, state, registry, {
  timeout: 5000,
});
```

The stream emits:

1. The initial HTML with fallback content in place of stream-mode directives
2. For each resolved directive, an inline `<script>` that swaps the fallback with rendered content

### Using with a server

```typescript
app.get('/', (req, res) => {
  const stream = renderStream(template, state, registry);
  const reader = stream.getReader();

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Transfer-Encoding', 'chunked');

  async function pump() {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    res.write(value);
    await pump();
  }

  pump();
});
```

Each streamed replacement script finds its target element by `data-g-async-id`, swaps the innerHTML, updates the async state to `loaded`, and triggers client hydration if available.

## Client Hydration

The client handles each SSR mode differently during hydration:

- **`data-g-async="loaded"`** — Content was fully rendered on the server. The client runs the async function for reactivity setup but doesn't re-render.
- **`data-g-async="pending"`** — Fallback was rendered. The client runs the async function and swaps to the template on success.
- **`data-g-async="streaming"`** — Fallback was rendered with a streaming ID. The client waits for the replacement script, then hydrates.
- **`data-g-async="timeout"`** — Server timed out. The client treats this like `pending` and re-attempts.

For streaming, the server exposes `window.__gonia_hydrate` so that inline replacement scripts can trigger hydration of newly inserted content.

## Data Attributes Reference

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-g-async` | `loaded` | Async fn completed, template rendered |
| | `pending` | Fallback rendered, client will load |
| | `streaming` | Fallback rendered, waiting for stream replacement |
| | `timeout` | Server timed out, client will retry |
| `data-g-async-id` | `g-async-0`, ... | Unique ID for stream replacement targeting |
| `data-g-prerendered` | `true` | Template content was rendered on server |
