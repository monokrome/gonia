import { defineConfig } from 'vite';
import { gonia } from '../../src/vite/plugin.js';

export default defineConfig({
  plugins: [gonia()]
  // Vite uses index.html as the entry point by default
  // It automatically discovers the <script type="module" src="./main.ts"> tag
});
