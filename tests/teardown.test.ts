import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hydrate, resetHydration } from '../src/client/hydrate.js';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { clearRootScope, clearElementScopes } from '../src/scope.js';
import { registerCleanup, runCleanups, clearCleanupMap } from '../src/teardown.js';
import { text } from '../src/directives/text.js';
import { cif } from '../src/directives/if.js';
import { applyGlobals, cleanupGlobals } from './test-globals.js';

function tick(ms = 10): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('Directive teardown', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();
    directive('g-text', text);
    directive('g-if', cif);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    clearCleanupMap();
    resetHydration();
    cleanupGlobals();
  });

  describe('registerCleanup / runCleanups', () => {
    it('should run cleanup when called', () => {
      const el = document.createElement('div');
      const cleanup = vi.fn();

      registerCleanup(el, cleanup);
      expect(cleanup).not.toHaveBeenCalled();

      runCleanups(el);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should run multiple cleanups in order', () => {
      const el = document.createElement('div');
      const order: number[] = [];

      registerCleanup(el, () => order.push(1));
      registerCleanup(el, () => order.push(2));
      registerCleanup(el, () => order.push(3));

      runCleanups(el);
      expect(order).toEqual([1, 2, 3]);
    });

    it('should isolate errors between cleanups', () => {
      const el = document.createElement('div');
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn(() => { throw new Error('boom'); });
      const cleanup3 = vi.fn();

      registerCleanup(el, cleanup1);
      registerCleanup(el, cleanup2);
      registerCleanup(el, cleanup3);

      runCleanups(el);
      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
      expect(cleanup3).toHaveBeenCalled();
    });

    it('should clear cleanups after running', () => {
      const el = document.createElement('div');
      const cleanup = vi.fn();

      registerCleanup(el, cleanup);
      runCleanups(el);
      runCleanups(el);

      expect(cleanup).toHaveBeenCalledOnce();
    });
  });

  describe('return-based cleanup from directives', () => {
    it('should register cleanup when directive returns a function', async () => {
      const cleanup = vi.fn();

      const myDir: Directive = ($element: Element) => {
        return cleanup;
      };
      myDir.$inject = ['$element'];
      directive('my-dir', myDir);

      document.body.innerHTML = '<div my-dir></div>';
      await hydrate();
      await tick();

      expect(cleanup).not.toHaveBeenCalled();

      const el = document.querySelector('[my-dir]')!;
      runCleanups(el);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should register cleanup when async directive resolves with a function', async () => {
      const cleanup = vi.fn();

      const myDir: Directive = async ($element: Element) => {
        return cleanup;
      };
      myDir.$inject = ['$element'];
      directive('my-dir', myDir);

      document.body.innerHTML = '<div my-dir></div>';
      await hydrate();
      await tick();

      const el = document.querySelector('[my-dir]')!;
      runCleanups(el);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should not register cleanup when directive returns void', async () => {
      const myDir: Directive = ($element: Element) => {
        // no return
      };
      myDir.$inject = ['$element'];
      directive('my-dir', myDir);

      document.body.innerHTML = '<div my-dir></div>';
      await hydrate();
      await tick();

      const el = document.querySelector('[my-dir]')!;
      // Should not throw
      runCleanups(el);
    });
  });
});
