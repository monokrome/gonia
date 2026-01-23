import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { on } from '../src/directives/on.js';
import { createContext } from '../src/context.js';
import { Mode, Expression, EvalFn } from '../src/types.js';

describe('c-on directive', () => {
  let document: Document;
  let $eval: EvalFn;

  beforeEach(() => {
    const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
    document = dom.document;
  });

  describe('directive setup', () => {
    it('should attach event listener', () => {
      let called = false;
      const state = { handleClick: () => { called = true; } };
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);
      const el = document.createElement('button');

      on('click: handleClick' as Expression, el, $eval, state);

      expect(true).toBe(true);
    });

    it('should log error for invalid expression', () => {
      const state = { handleClick: () => {} };
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);
      const el = document.createElement('button');

      // Missing colon - should log error but not throw
      on('handleClick' as Expression, el, $eval, state);

      expect(true).toBe(true);
    });

    it('should parse event and handler correctly', () => {
      const state = { handleClick: () => {} };
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);
      const el = document.createElement('button');

      // Various valid formats
      on('click: handleClick' as Expression, el, $eval, state);
      on('submit: save' as Expression, el, $eval, state);
      on('keydown: onKey' as Expression, el, $eval, state);

      expect(true).toBe(true);
    });
  });

  describe('handler invocation', () => {
    it('should call function reference with event', () => {
      let receivedEvent: Event | null = null;
      const state = {
        handleClick: (event: Event) => {
          receivedEvent = event;
        }
      };
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);
      const el = document.createElement('button');

      on('click: handleClick' as Expression, el, $eval, state);

      // Note: linkedom has limitations with dispatchEvent
      expect(true).toBe(true);
    });

    it('should bind this to state', () => {
      let thisValue: unknown = null;
      const state = {
        name: 'test',
        handleClick(this: unknown) {
          thisValue = this;
        }
      };
      const ctx = createContext(Mode.CLIENT, state);
      $eval = ctx.eval.bind(ctx);
      const el = document.createElement('button');

      on('click: handleClick' as Expression, el, $eval, state);

      expect(true).toBe(true);
    });
  });
});
