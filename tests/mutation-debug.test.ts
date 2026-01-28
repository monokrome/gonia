import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';

describe('mutation observer behavior', () => {
  it('shows naive approach causes duplicates', async () => {
    const window = new Window();
    const document = window.document;

    const indexed: Array<{ source: string; tagName: string }> = [];
    const selector = 'g-body, [g-text]';

    // Naive approach: process each addedNode and its descendants
    const observer = new window.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as unknown as Element;

          const matches: Element[] = el.matches(selector) ? [el] : [];
          const descendants = [...el.querySelectorAll(selector)];

          for (const match of [...matches, ...descendants]) {
            indexed.push({
              source: match === el ? 'direct' : 'descendant-of-' + el.tagName.toLowerCase(),
              tagName: match.tagName.toLowerCase()
            });
          }
        }
      }
    });

    observer.observe(document, { subtree: true, childList: true });

    document.body.innerHTML = `
      <div id="wrapper">
        <g-body>
          <span g-text="value">Text</span>
        </g-body>
      </div>
    `;

    await new Promise(r => setTimeout(r, 10));

    const counts = new Map<string, number>();
    for (const item of indexed) {
      counts.set(item.tagName, (counts.get(item.tagName) || 0) + 1);
    }

    // Without fix: g-body indexed 2x, span indexed 3x
    expect(counts.get('g-body')).toBe(2);
    expect(counts.get('span')).toBe(3);

    observer.disconnect();
  });

  it('shows fixed approach prevents duplicates', async () => {
    const window = new Window();
    const document = window.document;

    const indexed: Array<{ source: string; tagName: string }> = [];
    const selector = 'g-body, [g-text]';

    // Fixed approach: skip descendants that are also direct addedNodes
    const observer = new window.MutationObserver((mutations) => {
      // First collect all direct addedNodes
      const directNodes = new Set<Element>();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            directNodes.add(node as unknown as Element);
          }
        }
      }

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as unknown as Element;

          const matches: Element[] = el.matches(selector) ? [el] : [];
          // Filter out descendants that will be processed as direct addedNodes
          const descendants = [...el.querySelectorAll(selector)].filter(
            desc => !directNodes.has(desc)
          );

          for (const match of [...matches, ...descendants]) {
            indexed.push({
              source: match === el ? 'direct' : 'descendant-of-' + el.tagName.toLowerCase(),
              tagName: match.tagName.toLowerCase()
            });
          }
        }
      }
    });

    observer.observe(document, { subtree: true, childList: true });

    document.body.innerHTML = `
      <div id="wrapper">
        <g-body>
          <span g-text="value">Text</span>
        </g-body>
      </div>
    `;

    await new Promise(r => setTimeout(r, 10));

    const counts = new Map<string, number>();
    for (const item of indexed) {
      counts.set(item.tagName, (counts.get(item.tagName) || 0) + 1);
    }

    // With fix: each element indexed exactly once
    expect(counts.get('g-body')).toBe(1);
    expect(counts.get('span')).toBe(1);

    observer.disconnect();
  });
});
