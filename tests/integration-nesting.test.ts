/**
 * Integration tests for deeply nested directive scopes.
 *
 * Exercises the full hydration path (init()) with nested structural
 * directives, verifying scope inheritance, reactive updates, and
 * correct DOM output across multiple levels of nesting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrate, resetHydration } from '../src/client/hydrate.js';
import { directive, clearDirectives, Directive } from '../src/types.js';
import { clearRootScope, clearElementScopes } from '../src/scope.js';
import { text } from '../src/directives/text.js';
import { show } from '../src/directives/show.js';
import { cclass } from '../src/directives/class.js';
import { cfor } from '../src/directives/for.js';
import { cif } from '../src/directives/if.js';
import { on } from '../src/directives/on.js';
import { applyGlobals, cleanupGlobals } from './test-globals.js';

function tick(ms = 10): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('Integration: nested directive scopes', () => {
  beforeEach(() => {
    applyGlobals();
    clearDirectives();

    directive('g-text', text);
    directive('g-show', show);
    directive('g-class', cclass);
    directive('g-for', cfor);
    directive('g-if', cif);
    directive('g-on', on);
  });

  afterEach(() => {
    clearDirectives();
    clearRootScope();
    clearElementScopes();
    resetHydration();
    cleanupGlobals();
  });

  describe('nested g-for', () => {
    it('should render a matrix (g-for inside g-for)', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.rows = [
          { label: 'R1', cells: ['a', 'b'] },
          { label: 'R2', cells: ['c', 'd'] },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="row in rows">
            <span class="label" g-text="row.label"></span>
            <span class="cell" g-for="cell in row.cells" g-text="cell"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const labels = document.querySelectorAll('.label');
      expect(labels.length).toBe(2);
      expect(labels[0].textContent).toBe('R1');
      expect(labels[1].textContent).toBe('R2');

      const cells = document.querySelectorAll('.cell[data-g-for-processed]');
      expect(cells.length).toBe(4);
      expect(cells[0].textContent).toBe('a');
      expect(cells[1].textContent).toBe('b');
      expect(cells[2].textContent).toBe('c');
      expect(cells[3].textContent).toBe('d');
    });

    it('should access outer loop variable from inner loop', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.groups = [
          { name: 'G1', items: ['x', 'y'] },
          { name: 'G2', items: ['z'] },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="group in groups">
            <span class="combo" g-for="item in group.items" g-text="group.name + ':' + item"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const combos = document.querySelectorAll('.combo[data-g-for-processed]');
      expect(combos.length).toBe(3);
      expect(combos[0].textContent).toBe('G1:x');
      expect(combos[1].textContent).toBe('G1:y');
      expect(combos[2].textContent).toBe('G2:z');
    });

    it('should reactively update when outer array changes', async () => {
      let state: Record<string, unknown>;
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.rows = [
          { cols: ['a', 'b'] },
        ];
        state = $scope;
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="row in rows">
            <span class="cell" g-for="c in row.cols" g-text="c"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelectorAll('.cell[data-g-for-processed]').length).toBe(2);

      state!.rows = [
        { cols: ['a', 'b'] },
        { cols: ['c', 'd', 'e'] },
      ];
      await tick();

      const cells = document.querySelectorAll('.cell[data-g-for-processed]');
      expect(cells.length).toBe(5);
      expect(cells[2].textContent).toBe('c');
      expect(cells[3].textContent).toBe('d');
      expect(cells[4].textContent).toBe('e');
    });

    it('should handle triple-nested g-for', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.tables = [
          {
            rows: [
              { cells: ['1', '2'] },
              { cells: ['3'] },
            ],
          },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div class="table" g-for="table in tables">
            <div class="row" g-for="row in table.rows">
              <span class="cell" g-for="cell in row.cells" g-text="cell"></span>
            </div>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const cells = document.querySelectorAll('.cell[data-g-for-processed]');
      expect(cells.length).toBe(3);
      expect(cells[0].textContent).toBe('1');
      expect(cells[1].textContent).toBe('2');
      expect(cells[2].textContent).toBe('3');
    });
  });

  describe('nested g-if + g-for + g-text through hydration', () => {
    it('should render g-for inside g-if when condition is true', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.show = true;
        $scope.items = ['alpha', 'beta'];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-if="show">
            <span g-for="item in items" g-text="item"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const spans = document.querySelectorAll('span[data-g-for-processed]');
      expect(spans.length).toBe(2);
      expect(spans[0].textContent).toBe('alpha');
      expect(spans[1].textContent).toBe('beta');
    });

    it('should not render g-for inside g-if when condition is false', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.show = false;
        $scope.items = ['alpha', 'beta'];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-if="show">
            <span g-for="item in items" g-text="item"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const spans = document.querySelectorAll('span[data-g-for-processed]');
      expect(spans.length).toBe(0);
    });

    it('should reactively toggle g-if containing g-for', async () => {
      let state: Record<string, unknown>;
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.show = false;
        $scope.items = ['one', 'two'];
        state = $scope;
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-if="show">
            <span g-for="item in items" g-text="item"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelectorAll('span[data-g-for-processed]').length).toBe(0);

      state!.show = true;
      await tick();

      const spans = document.querySelectorAll('span[data-g-for-processed]');
      expect(spans.length).toBe(2);
      expect(spans[0].textContent).toBe('one');
      expect(spans[1].textContent).toBe('two');

      state!.show = false;
      await tick();

      expect(document.querySelectorAll('span[data-g-for-processed]').length).toBe(0);
    });

    it('should handle g-if per item inside g-for', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.items = [
          { name: 'visible', active: true },
          { name: 'hidden', active: false },
          { name: 'also visible', active: true },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="item in items">
            <span g-if="item.active" g-text="item.name"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const spans = document.querySelectorAll('span[data-g-if-processed]');
      expect(spans.length).toBe(2);
      expect(spans[0].textContent).toBe('visible');
      expect(spans[1].textContent).toBe('also visible');
    });
  });

  describe('nested custom directive scopes', () => {
    it('should inherit parent directive scope in child directive', async () => {
      const parent: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.parentVal = 'from-parent';
      };
      parent.$inject = ['$element', '$scope'];
      directive('parent-dir', parent, { scope: true });

      const child: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.childVal = 'from-child';
      };
      child.$inject = ['$element', '$scope'];
      directive('child-dir', child, { scope: true });

      document.body.innerHTML = `
        <parent-dir>
          <child-dir>
            <span class="parent-read" g-text="parentVal"></span>
            <span class="child-read" g-text="childVal"></span>
          </child-dir>
        </parent-dir>
      `;

      await hydrate();
      await tick();

      expect(document.querySelector('.parent-read')!.textContent).toBe('from-parent');
      expect(document.querySelector('.child-read')!.textContent).toBe('from-child');
    });

    it('should allow child scope to shadow parent properties', async () => {
      const parent: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.value = 'parent-value';
      };
      parent.$inject = ['$element', '$scope'];
      directive('outer-dir', parent, { scope: true });

      const child: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.value = 'child-value';
      };
      child.$inject = ['$element', '$scope'];
      directive('inner-dir', child, { scope: true });

      document.body.innerHTML = `
        <outer-dir>
          <span class="outer-read" g-text="value"></span>
          <inner-dir>
            <span class="inner-read" g-text="value"></span>
          </inner-dir>
        </outer-dir>
      `;

      await hydrate();
      await tick();

      expect(document.querySelector('.outer-read')!.textContent).toBe('parent-value');
      expect(document.querySelector('.inner-read')!.textContent).toBe('child-value');
    });

    it('should support three levels of nested directive scopes', async () => {
      const grandparent: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.level = 'grandparent';
        $scope.gpOnly = 'gp';
      };
      grandparent.$inject = ['$element', '$scope'];
      directive('gp-dir', grandparent, { scope: true });

      const parentDir: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.level = 'parent';
        $scope.pOnly = 'p';
      };
      parentDir.$inject = ['$element', '$scope'];
      directive('p-dir', parentDir, { scope: true });

      const childDir: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.level = 'child';
        $scope.cOnly = 'c';
      };
      childDir.$inject = ['$element', '$scope'];
      directive('c-dir', childDir, { scope: true });

      document.body.innerHTML = `
        <gp-dir>
          <p-dir>
            <c-dir>
              <span class="level" g-text="level"></span>
              <span class="gp" g-text="gpOnly"></span>
              <span class="p" g-text="pOnly"></span>
              <span class="c" g-text="cOnly"></span>
            </c-dir>
          </p-dir>
        </gp-dir>
      `;

      await hydrate();
      await tick();

      expect(document.querySelector('.level')!.textContent).toBe('child');
      expect(document.querySelector('.gp')!.textContent).toBe('gp');
      expect(document.querySelector('.p')!.textContent).toBe('p');
      expect(document.querySelector('.c')!.textContent).toBe('c');
    });
  });

  describe('nested g-for reactivity', () => {
    it('should preserve inner loops when outer array item is unchanged', async () => {
      let state: Record<string, unknown>;
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.groups = [
          { name: 'A', tags: ['t1', 't2'] },
          { name: 'B', tags: ['t3'] },
        ];
        state = $scope;
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div class="group" g-for="g in groups">
            <span class="name" g-text="g.name"></span>
            <span class="tag" g-for="t in g.tags" g-text="t"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelectorAll('.tag[data-g-for-processed]').length).toBe(3);

      // Replace entire array — all groups re-render
      state!.groups = [
        { name: 'A', tags: ['t1', 't2'] },
        { name: 'B', tags: ['t3', 't4', 't5'] },
      ];
      await tick();

      const tags = document.querySelectorAll('.tag[data-g-for-processed]');
      expect(tags.length).toBe(5);
      expect(tags[2].textContent).toBe('t3');
      expect(tags[3].textContent).toBe('t4');
      expect(tags[4].textContent).toBe('t5');
    });

    it('should handle outer array shrinking', async () => {
      let state: Record<string, unknown>;
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.rows = [
          { cols: ['a', 'b'] },
          { cols: ['c', 'd'] },
          { cols: ['e', 'f'] },
        ];
        state = $scope;
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="row in rows">
            <span class="col" g-for="col in row.cols" g-text="col"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelectorAll('.col[data-g-for-processed]').length).toBe(6);

      state!.rows = [{ cols: ['a', 'b'] }];
      await tick();

      const cols = document.querySelectorAll('.col[data-g-for-processed]');
      expect(cols.length).toBe(2);
      expect(cols[0].textContent).toBe('a');
      expect(cols[1].textContent).toBe('b');
    });

    it('should handle outer array growing', async () => {
      let state: Record<string, unknown>;
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.rows = [{ cols: ['x'] }];
        state = $scope;
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="row in rows">
            <span class="col" g-for="col in row.cols" g-text="col"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelectorAll('.col[data-g-for-processed]').length).toBe(1);

      state!.rows = [
        { cols: ['x'] },
        { cols: ['y', 'z'] },
      ];
      await tick();

      const cols = document.querySelectorAll('.col[data-g-for-processed]');
      expect(cols.length).toBe(3);
      expect(cols[0].textContent).toBe('x');
      expect(cols[1].textContent).toBe('y');
      expect(cols[2].textContent).toBe('z');
    });
  });

  describe('scope interactions with events', () => {
    it('should access correct scope in g-on inside nested g-for', async () => {
      let captured: string[] = [];
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.groups = [
          { items: ['a', 'b'] },
          { items: ['c'] },
        ];
        $scope.log = (item: string) => { captured.push(item); };
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="group in groups">
            <button class="btn" g-for="item in group.items" g-on="click: log(item)" g-text="item"></button>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const buttons = document.querySelectorAll('.btn[data-g-for-processed]');
      expect(buttons.length).toBe(3);

      // Click each button and verify correct scope variable is captured
      (buttons[0] as HTMLElement).click();
      (buttons[1] as HTMLElement).click();
      (buttons[2] as HTMLElement).click();

      expect(captured).toEqual(['a', 'b', 'c']);
    });

    it('should mutate correct scope from nested directive event', async () => {
      const parent: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.count = 0;
        $scope.increment = () => { ($scope as { count: number }).count++; };
      };
      parent.$inject = ['$element', '$scope'];
      directive('counter-app', parent, { scope: true });

      document.body.innerHTML = `
        <counter-app>
          <span class="count" g-text="count"></span>
          <button class="btn" g-on="click: increment">+</button>
        </counter-app>
      `;

      await hydrate();
      await tick();

      expect(document.querySelector('.count')!.textContent).toBe('0');

      (document.querySelector('.btn') as HTMLElement).click();
      await tick();

      expect(document.querySelector('.count')!.textContent).toBe('1');
    });
  });

  describe('g-for with index variables across nesting', () => {
    it('should provide correct $index at each nesting level', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.outer = [
          { inner: ['a', 'b'] },
          { inner: ['c'] },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-for="(o, oi) in outer">
            <span class="idx" g-for="(val, ii) in o.inner" g-text="oi + '.' + ii + ':' + val"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const items = document.querySelectorAll('.idx[data-g-for-processed]');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('0.0:a');
      expect(items[1].textContent).toBe('0.1:b');
      expect(items[2].textContent).toBe('1.0:c');
    });
  });

  describe('g-if + g-for co-located with nested content', () => {
    it('should render nested directives inside co-located g-if + g-for items', async () => {
      const provider: Directive = ($element: Element, $scope: Record<string, unknown>) => {
        $scope.show = true;
        $scope.items = [
          { name: 'A', active: true },
          { name: 'B', active: false },
        ];
      };
      provider.$inject = ['$element', '$scope'];
      directive('app', provider, { scope: true });

      document.body.innerHTML = `
        <app>
          <div g-if="show" g-for="item in items">
            <span class="name" g-text="item.name"></span>
            <span class="status" g-class="{ active: item.active }"></span>
          </div>
        </app>
      `;

      await hydrate();
      await tick();

      const names = document.querySelectorAll('.name');
      expect(names.length).toBe(2);
      expect(names[0].textContent).toBe('A');
      expect(names[1].textContent).toBe('B');

      const statuses = document.querySelectorAll('.status');
      expect(statuses[0].classList.contains('active')).toBe(true);
      expect(statuses[1].classList.contains('active')).toBe(false);
    });
  });
});
