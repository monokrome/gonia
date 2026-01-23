/**
 * Todo app entry point.
 */

// Import directives (registers via side effect)
import './directives/todo-app.js';

// Initialize framework
import { hydrate } from '../../src/client/hydrate.js';

function init() {
  hydrate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
