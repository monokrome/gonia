/**
 * SSR server for todo app.
 */

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { render, registerDirective, DirectiveRegistry } from '../../src/server/render.js';

// Import directives
import { text } from '../../src/directives/text.js';
import { show } from '../../src/directives/show.js';
import { cclass } from '../../src/directives/class.js';
import { cfor } from '../../src/directives/for.js';
import { cif } from '../../src/directives/if.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function startServer() {
  // Create directive registry with built-in directives
  const registry: DirectiveRegistry = new Map();
  registerDirective(registry, 'text', text);
  registerDirective(registry, 'show', show);
  registerDirective(registry, 'class', cclass);
  registerDirective(registry, 'for', cfor);
  registerDirective(registry, 'if', cif);

  // Initial state for SSR (empty todos)
  const initialState = {
    todos: [] as Array<{ id: number; text: string; done: boolean }>,
    newTodo: '',
    filter: 'all' as const,
    nextId: 1,
    filteredTodos: [] as Array<{ id: number; text: string; done: boolean }>,
    remainingCount: 0
  };

  const server = createServer(async (req, res) => {
    const url = req.url || '/';

    try {
      if (url !== '/') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      // Read the HTML template
      const template = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');

      // Extract the content inside <todo-app>
      const todoAppMatch = template.match(/<todo-app>([\s\S]*?)<\/todo-app>/);
      if (!todoAppMatch) {
        res.statusCode = 500;
        res.end('Could not find <todo-app> in template');
        return;
      }

      const todoAppContent = todoAppMatch[1];

      // Server-side render the todo app content
      const renderedContent = await render(todoAppContent, initialState, registry);

      // Replace the original content with rendered content
      const html = template.replace(
        /<todo-app>[\s\S]*?<\/todo-app>/,
        `<todo-app>${renderedContent}</todo-app>`
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end((e as Error).stack || (e as Error).message);
    }
  });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.listen(port, () => {
    console.log(`SSR server running at http://localhost:${port}`);
  });
}

startServer();
