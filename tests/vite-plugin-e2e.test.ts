/**
 * E2E tests for the Vite plugin with real file scanning.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { gonia } from '../src/vite/plugin.js';

const TEST_DIR = join(process.cwd(), '.test-directives');

describe('gonia vite plugin E2E', () => {
  beforeAll(() => {
    // Create test directory with custom directives
    mkdirSync(TEST_DIR, { recursive: true });

    // Create a custom attribute directive
    writeFileSync(
      join(TEST_DIR, 'tooltip.ts'),
      `
import { directive } from 'gonia';

const tooltip = ($element, $scope) => {
  // tooltip implementation
};

directive('g-tooltip', tooltip);
`
    );

    // Create a custom element directive
    writeFileSync(
      join(TEST_DIR, 'app-header.ts'),
      `
import { directive } from 'gonia';

const appHeader = ($element, $scope) => {
  $scope.title = 'Header';
};

directive('app-header', appHeader, { scope: true });
`
    );

    // Create a directive with multiple registrations
    writeFileSync(
      join(TEST_DIR, 'ui-components.ts'),
      `
import { directive } from 'gonia';

const button = ($element) => {};
const card = ($element) => {};

directive('ui-button', button);
directive('ui-card', card);
`
    );
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  async function createPlugin(options = {}) {
    const plugin = gonia({
      directiveSources: ['.test-directives/**/*.ts'],
      ...options
    });

    // Initialize plugin
    if (typeof plugin.configResolved === 'function') {
      plugin.configResolved({ command: 'build', root: process.cwd() } as any);
    }

    // Run buildStart to scan directives
    if (typeof plugin.buildStart === 'function') {
      await (plugin.buildStart as any).call({});
    }

    return plugin;
  }

  function transform(plugin: any, code: string, id: string = '/app/test.ts') {
    const result = (plugin.transform as any).call({}, code, id);
    return result?.code ?? null;
  }

  describe('directive source scanning', () => {
    it('should discover custom attribute directives', async () => {
      const plugin = await createPlugin();
      const code = 'const html = `<div g-tooltip="message"></div>`;';
      const result = transform(plugin, code);

      expect(result).toContain('tooltip.js');
      expect(result).toMatch(/import\s+['"][^'"]*tooltip\.js['"]/);
    });

    it('should discover custom element directives', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['app-']
      });
      const code = 'const html = `<app-header></app-header>`;';
      const result = transform(plugin, code);

      expect(result).toContain('app-header.js');
      expect(result).toMatch(/import\s+['"][^'"]*app-header\.js['"]/);
    });

    it('should discover multiple directives from one file', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['ui-']
      });
      const code = 'const html = `<ui-button>Click</ui-button><ui-card></ui-card>`;';
      const result = transform(plugin, code);

      expect(result).toContain('ui-components.js');
    });

    it('should combine built-in and custom directives', async () => {
      const plugin = await createPlugin();
      const code = 'const html = `<div g-text="msg" g-tooltip="tip"></div>`;';
      const result = transform(plugin, code);

      expect(result).toContain("import { text } from 'gonia/directives'");
      expect(result).toContain('tooltip.js');
    });
  });

  describe('prefix configuration', () => {
    it('should respect directiveAttributePrefixes', async () => {
      const plugin = await createPlugin({
        directiveAttributePrefixes: ['g-', 'x-']
      });

      const code1 = 'const html = `<div g-text="msg"></div>`;';
      const result1 = transform(plugin, code1);
      expect(result1).toContain('text');

      const code2 = 'const html = `<div x-custom="val"></div>`;';
      const result2 = transform(plugin, code2, '/app/test2.ts');
      // x-custom is not registered, so no import
      expect(result2).toBeNull();
    });

    it('should respect directiveElementPrefixes', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['app-', 'ui-']
      });

      const code = 'const html = `<app-header></app-header><ui-button></ui-button>`;';
      const result = transform(plugin, code);

      expect(result).toContain('app-header');
      expect(result).toContain('ui-components');
    });

    it('should use attribute prefixes as element default', async () => {
      const plugin = await createPlugin({
        directiveAttributePrefixes: ['my-']
      });

      // Without explicit element prefixes, uses attribute prefixes
      const code = 'const html = `<my-component></my-component>`;';
      const result = transform(plugin, code);

      // my-component not registered, so null
      expect(result).toBeNull();
    });
  });

  describe('include and exclude with full names', () => {
    it('should include custom directives by full name', async () => {
      const plugin = await createPlugin({
        includeDirectives: ['g-tooltip']
      });

      const code = 'const x = 1;'; // No directives in code
      const result = transform(plugin, code);

      expect(result).toContain('tooltip.js');
    });

    it('should exclude custom directives by full name', async () => {
      const plugin = await createPlugin({
        excludeDirectives: ['g-tooltip']
      });

      const code = 'const html = `<div g-text="msg" g-tooltip="tip"></div>`;';
      const result = transform(plugin, code);

      // Should have text import
      expect(result).toContain("from 'gonia/directives'");
      // Should not have tooltip import (check for .js file import)
      expect(result).not.toContain('tooltip.js');
    });

    it('should exclude element directives', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['app-'],
        excludeDirectives: ['app-header']
      });

      const code = 'const html = `<app-header></app-header>`;';
      const result = transform(plugin, code);

      expect(result).toBeNull();
    });
  });

  describe('$inject transformation with custom directives', () => {
    it('should add $inject to custom directive functions', async () => {
      const plugin = await createPlugin();

      const code = `
import { directive } from 'gonia';

const myWidget = ($element, $scope, $eval) => {
  $scope.value = $eval('initialValue');
};

directive('my-widget', myWidget, { scope: true });
`;
      const result = transform(plugin, code);

      expect(result).toContain('myWidget.$inject = ["$element","$scope","$eval"]');
    });
  });

  describe('library directive discovery', () => {
    const MOCK_MODULES = join(process.cwd(), 'node_modules', 'mock-gonia-lib');

    beforeAll(() => {
      // Create mock library with gonia directives
      mkdirSync(join(MOCK_MODULES, 'dist'), { recursive: true });

      // Write package.json with gonia field
      writeFileSync(
        join(MOCK_MODULES, 'package.json'),
        JSON.stringify({
          name: 'mock-gonia-lib',
          version: '1.0.0',
          gonia: {
            directives: {
              'lib-button': './dist/button.js',
              'lib-modal': './dist/modal.js'
            }
          }
        }, null, 2)
      );

      // Write directive files
      writeFileSync(
        join(MOCK_MODULES, 'dist', 'button.js'),
        'export default function libButton() {}'
      );
      writeFileSync(
        join(MOCK_MODULES, 'dist', 'modal.js'),
        'export default function libModal() {}'
      );

      // Ensure main package.json has this as a dependency
      const mainPkgPath = join(process.cwd(), 'package.json');
      const mainPkg = JSON.parse(require('fs').readFileSync(mainPkgPath, 'utf-8'));
      mainPkg._originalDeps = { ...mainPkg.dependencies };
      mainPkg.dependencies = {
        ...mainPkg.dependencies,
        'mock-gonia-lib': '1.0.0'
      };
      writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + '\n');
    });

    afterAll(() => {
      // Restore main package.json
      const mainPkgPath = join(process.cwd(), 'package.json');
      const mainPkg = JSON.parse(require('fs').readFileSync(mainPkgPath, 'utf-8'));
      mainPkg.dependencies = mainPkg._originalDeps;
      delete mainPkg._originalDeps;
      writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + '\n');

      // Clean up mock module
      rmSync(MOCK_MODULES, { recursive: true, force: true });
    });

    it('should discover directives from library package.json', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['lib-']
      });

      const code = 'const html = `<lib-button>Click</lib-button>`;';
      const result = transform(plugin, code);

      expect(result).toContain('mock-gonia-lib/dist/button.js');
    });

    it('should discover multiple directives from same library', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['lib-']
      });

      const code = 'const html = `<lib-button>OK</lib-button><lib-modal></lib-modal>`;';
      const result = transform(plugin, code);

      expect(result).toContain('mock-gonia-lib/dist/button.js');
      expect(result).toContain('mock-gonia-lib/dist/modal.js');
    });

    it('should allow local directives to override library directives', async () => {
      // Create a local directive with same name
      writeFileSync(
        join(TEST_DIR, 'lib-button-override.ts'),
        `
import { directive } from 'gonia';
directive('lib-button', () => {});
`
      );

      const plugin = await createPlugin({
        directiveElementPrefixes: ['lib-'],
        directiveSources: ['.test-directives/**/*.ts']
      });

      const code = 'const html = `<lib-button>Click</lib-button>`;';
      const result = transform(plugin, code);

      // Should use local version, not library
      expect(result).toContain('lib-button-override.js');
      expect(result).not.toContain('mock-gonia-lib');

      // Clean up
      rmSync(join(TEST_DIR, 'lib-button-override.ts'));
    });

    it('should combine library and built-in directives', async () => {
      const plugin = await createPlugin({
        directiveElementPrefixes: ['lib-']
      });

      const code = 'const html = `<lib-button g-text="label">Click</lib-button>`;';
      const result = transform(plugin, code);

      expect(result).toContain("import { text } from 'gonia/directives'");
      expect(result).toContain('mock-gonia-lib/dist/button.js');
    });
  });

  describe('edge cases', () => {
    it('should handle empty directive sources', async () => {
      const plugin = await createPlugin({
        directiveSources: []
      });

      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(plugin, code);

      // Should still work with built-ins
      expect(result).toContain("import { text } from 'gonia/directives'");
    });

    it('should handle non-existent source patterns', async () => {
      const plugin = await createPlugin({
        directiveSources: ['non-existent/**/*.ts']
      });

      const code = 'const html = `<div g-text="msg"></div>`;';
      const result = transform(plugin, code);

      // Should still work with built-ins
      expect(result).toContain("import { text } from 'gonia/directives'");
    });

    it('should not inject imports for unknown directives', async () => {
      const plugin = await createPlugin();

      const code = 'const html = `<div g-unknown="val"></div>`;';
      const result = transform(plugin, code);

      // g-unknown is not registered anywhere
      expect(result).toBeNull();
    });

    it('should handle directives in comments gracefully', async () => {
      const plugin = await createPlugin();

      const code = `
// Use g-text for text binding
/* g-show for visibility */
const html = \`<div g-if="visible"></div>\`;
`;
      const result = transform(plugin, code);

      // Should detect g-text, g-show from comments (false positives are OK)
      // and g-if from actual template
      expect(result).toContain('cif');
    });
  });
});
