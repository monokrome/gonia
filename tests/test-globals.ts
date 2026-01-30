/**
 * Browser global management for tests.
 *
 * Creates a fresh JSDOM per call, providing isolated browser globals
 * (document, customElements, etc.) without cross-test contamination.
 *
 * Unmocked browser globals get throwing getters so new dependencies
 * are caught immediately instead of silently returning undefined.
 */

import { JSDOM } from 'jsdom';

/**
 * Browser globals required by the framework.
 * Add entries here when production code uses new browser APIs.
 */
const BROWSER_GLOBALS = [
  'document',
  'customElements',
  'HTMLElement',
  'HTMLSlotElement',
  'HTMLTemplateElement',
  'MutationObserver',
  'Node',
  'Element',
  'Text',
  'DocumentFragment',
  'DOMTokenList',
  'Event',
  'CustomEvent',
  'NodeFilter',
] as const;

/**
 * JSDOM properties to skip when installing guarded getters.
 * These are either accessed by Node/Vitest internals or are
 * non-API properties that would cause false positives.
 */
const GUARD_SKIP = new Set([
  'undefined', 'NaN', 'Infinity',
  'globalThis', 'self', 'window', 'top', 'parent', 'frames', 'length',
  'constructor', 'toString', 'valueOf', 'toLocaleString',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
]);

const installedKeys = new Set<string>();

/**
 * Install fresh browser globals from a new JSDOM instance.
 *
 * Sets required globals and adds throwing getters for all other
 * JSDOM-provided globals so missing mocks fail loudly.
 */
export function applyGlobals(): void {
  cleanupGlobals();

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
  });

  const existingGlobals = new Set(Object.getOwnPropertyNames(globalThis));

  for (const key of BROWSER_GLOBALS) {
    const value = (dom.window as Record<string, unknown>)[key];
    if (value !== undefined) {
      (globalThis as Record<string, unknown>)[key] = value;
      installedKeys.add(key);
    }
  }

  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (installedKeys.has(key)) continue;
    if (existingGlobals.has(key)) continue;
    if (GUARD_SKIP.has(key)) continue;
    if (key.startsWith('_')) continue;
    if (key.startsWith('on')) continue;

    try {
      Object.defineProperty(globalThis, key, {
        get() {
          throw new Error(
            `Browser global '${key}' accessed but not mocked. ` +
            `Add it to BROWSER_GLOBALS in tests/test-globals.ts`
          );
        },
        configurable: true,
      });
      installedKeys.add(key);
    } catch {
      // Some properties can't be redefined
    }
  }
}

/**
 * Remove all installed browser globals and guarded getters.
 */
export function cleanupGlobals(): void {
  for (const key of installedKeys) {
    try {
      delete (globalThis as Record<string, unknown>)[key];
    } catch {
      // Ignore undeletable properties
    }
  }
  installedKeys.clear();
}
