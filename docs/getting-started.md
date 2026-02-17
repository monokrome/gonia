# Getting Started

Gonia is an SSR-first reactive UI library. This guide walks through setting up a basic application with server-side rendering and client-side hydration.

## Installation

```bash
pnpm add gonia
```

## Project Structure

A typical Gonia project:

```
my-app/
├── src/
│   ├── server.ts      # SSR server
│   ├── main.ts        # Client entry point
│   └── directives/    # Component directives
│       └── app.ts
├── index.html         # HTML template
├── vite.config.ts     # Vite configuration
└── package.json
```

## Basic Setup

### 1. Create the HTML Template

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <my-app>
    <h1 g-text="title"></h1>
    <p g-text="message"></p>
  </my-app>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

### 2. Create a Component Directive

```typescript
// src/directives/app.ts
import { directive, Directive } from 'gonia';

// Parameter names are dependency names — the framework provides them
const app: Directive = ($element, $scope) => {
  $scope.title = 'Welcome';
  $scope.message = 'Hello from Gonia!';
};

directive('my-app', app, { scope: true });
```

### 3. Set Up Client Hydration

```typescript
// src/main.ts
import { hydrate } from 'gonia/client';
import './directives/app.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => hydrate());
} else {
  hydrate();
}
```

### 4. Set Up SSR Server

```typescript
// src/server.ts
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { render } from 'gonia/server';

// Importing directives registers them globally via directive()
import './directives/app.js';

const template = readFileSync('./index.html', 'utf-8');

const server = createServer(async (req, res) => {
  const state = { title: 'Welcome', message: 'Hello from Gonia!' };

  // Extract content to render
  const match = template.match(/<my-app>([\s\S]*?)<\/my-app>/);
  const content = match ? match[1] : '';

  // Server-side render — directives registered via directive() are
  // picked up from the global registry automatically
  const rendered = await render(content, state, new Map());

  // Replace in template
  const html = template.replace(
    /<my-app>[\s\S]*?<\/my-app>/,
    `<my-app>${rendered}</my-app>`
  );

  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});

server.listen(3000);
```

### 5. Configure Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { gonia } from 'gonia/vite';

export default defineConfig({
  plugins: [gonia()]
});
```

## Running the Application

For development with SSR:

```bash
npx tsx src/server.ts
```

For client-only development:

```bash
npx vite
```

## Next Steps

- Learn about [Directives](./directives.md)
- Understand [SSR](./ssr.md) in depth
- Explore the [Reactivity](./reactivity.md) system
