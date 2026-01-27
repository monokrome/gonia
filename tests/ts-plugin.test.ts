/**
 * Tests for the TypeScript Language Service Plugin.
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Import the plugin factory
// Note: We need to test the source directly since the built version is CommonJS
import initPlugin from '../src/ts-plugin/index.js';

describe('gonia ts-plugin', () => {
  describe('inferTypesFromTemplate', () => {
    // Access the internal function via module internals
    // For testing, we'll create a test harness that uses the plugin

    it('should detect checkbox g-model as boolean', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const toggle = ($scope: { isEnabled: string }) => {
          console.log($scope.isEnabled);
        };

        directive('my-toggle', toggle, {
          template: '<input type="checkbox" g-model="isEnabled">'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('isEnabled') &&
        d.messageText.toString().includes('boolean') &&
        d.messageText.toString().includes('string')
      )).toBe(true);
    });

    it('should detect number input g-model as number', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const counter = ($scope: { count: string }) => {
          console.log($scope.count);
        };

        directive('my-counter', counter, {
          template: '<input type="number" g-model="count">'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('count') &&
        d.messageText.toString().includes('number') &&
        d.messageText.toString().includes('string')
      )).toBe(true);
    });

    it('should not report error when types match', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const toggle = ($scope: { isEnabled: boolean }) => {
          console.log($scope.isEnabled);
        };

        directive('my-toggle', toggle, {
          template: '<input type="checkbox" g-model="isEnabled">'
        });
      `);

      // Should have no gonia diagnostics
      const goniaDiagnostics = diagnostics.filter(d => d.source === 'gonia');
      expect(goniaDiagnostics).toHaveLength(0);
    });

    it('should handle text input as string', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const input = ($scope: { value: number }) => {
          console.log($scope.value);
        };

        directive('my-input', input, {
          template: '<input type="text" g-model="value">'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('value') &&
        d.messageText.toString().includes('string') &&
        d.messageText.toString().includes('number')
      )).toBe(true);
    });

    it('should handle textarea as string', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const editor = ($scope: { content: boolean }) => {
          console.log($scope.content);
        };

        directive('my-editor', editor, {
          template: '<textarea g-model="content"></textarea>'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('content') &&
        d.messageText.toString().includes('string') &&
        d.messageText.toString().includes('boolean')
      )).toBe(true);
    });

    it('should handle inline arrow functions', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        directive('my-toggle', ($scope: { enabled: string }) => {
          console.log($scope.enabled);
        }, {
          template: '<input type="checkbox" g-model="enabled">'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('enabled') &&
        d.messageText.toString().includes('boolean')
      )).toBe(true);
    });
  });

  describe('g-scope type inference', () => {
    it('should infer number from g-scope literal', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const counter = ($scope: { count: string }) => {
          console.log($scope.count);
        };

        directive('my-counter', counter, {
          template: '<div g-scope="{ count: 0 }"></div>'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('count') &&
        d.messageText.toString().includes('number') &&
        d.messageText.toString().includes('string')
      )).toBe(true);
    });

    it('should infer string from g-scope literal', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const greeter = ($scope: { name: number }) => {
          console.log($scope.name);
        };

        directive('my-greeter', greeter, {
          template: '<div g-scope="{ name: \\'Alice\\' }"></div>'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('name') &&
        d.messageText.toString().includes('string') &&
        d.messageText.toString().includes('number')
      )).toBe(true);
    });

    it('should infer boolean from g-scope literal', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const toggle = ($scope: { enabled: string }) => {
          console.log($scope.enabled);
        };

        directive('my-toggle', toggle, {
          template: '<div g-scope="{ enabled: true }"></div>'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('enabled') &&
        d.messageText.toString().includes('boolean') &&
        d.messageText.toString().includes('string')
      )).toBe(true);
    });

    it('should infer array from g-scope literal', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const list = ($scope: { items: string }) => {
          console.log($scope.items);
        };

        directive('my-list', list, {
          template: '<div g-scope="{ items: [] }"></div>'
        });
      `);

      expect(diagnostics.some(d =>
        d.messageText.toString().includes('items') &&
        d.messageText.toString().includes('array')
      )).toBe(true);
    });

    it('should not report error when g-scope types match', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const counter = ($scope: { count: number, name: string, active: boolean }) => {
          console.log($scope.count, $scope.name, $scope.active);
        };

        directive('my-counter', counter, {
          template: '<div g-scope="{ count: 0, name: \\'test\\', active: false }"></div>'
        });
      `);

      const goniaDiagnostics = diagnostics.filter(d => d.source === 'gonia');
      expect(goniaDiagnostics).toHaveLength(0);
    });

    it('should handle multiple properties in g-scope', () => {
      const diagnostics = getDiagnosticsForCode(`
        import { directive } from 'gonia';

        const app = ($scope: { count: string, name: number }) => {
          console.log($scope.count, $scope.name);
        };

        directive('my-app', app, {
          template: '<div g-scope="{ count: 42, name: \\'Alice\\' }"></div>'
        });
      `);

      // Should have errors for both mismatched types
      expect(diagnostics.filter(d => d.source === 'gonia').length).toBeGreaterThanOrEqual(1);
    });
  });
});

/**
 * Helper to get diagnostics for a code snippet using the plugin.
 */
function getDiagnosticsForCode(code: string): ts.Diagnostic[] {
  // Create a temporary file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonia-ts-plugin-test-'));
  const tmpFile = path.join(tmpDir, 'test.ts');

  // Add a mock gonia module declaration
  const fullCode = `
    declare module 'gonia' {
      export function directive(name: string, fn: Function, options?: { template?: string }): void;
    }
    ${code}
  `;

  fs.writeFileSync(tmpFile, fullCode);

  try {
    // Create a program
    const program = ts.createProgram([tmpFile], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      skipLibCheck: true,
    });

    const sourceFile = program.getSourceFile(tmpFile);
    if (!sourceFile) {
      return [];
    }

    // Create a mock language service
    const servicesHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => [tmpFile],
      getScriptVersion: () => '1',
      getScriptSnapshot: (fileName) => {
        if (fileName === tmpFile) {
          return ts.ScriptSnapshot.fromString(fullCode);
        }
        if (fs.existsSync(fileName)) {
          return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
        }
        return undefined;
      },
      getCurrentDirectory: () => tmpDir,
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        strict: true,
        skipLibCheck: true,
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    const languageService = ts.createLanguageService(servicesHost, ts.createDocumentRegistry());

    // Initialize the plugin
    const plugin = initPlugin({ typescript: ts });
    const pluginInfo: ts.server.PluginCreateInfo = {
      languageService,
      languageServiceHost: servicesHost,
      project: {
        projectService: {
          logger: {
            info: () => {},
          },
        },
      } as unknown as ts.server.Project,
      serverHost: {} as ts.server.ServerHost,
      config: {},
    };

    const proxiedService = plugin.create(pluginInfo);

    // Get diagnostics through the proxied service
    return proxiedService.getSemanticDiagnostics(tmpFile);
  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
