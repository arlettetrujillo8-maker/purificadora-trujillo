const assert = require("node:assert/strict");
const { bindStableAuthDelegation } = require("../js/central-auth-ui.js");

const listeners = [];
const root = {
  addEventListener(type, handler, capture) {
    listeners.push({ type, handler, capture });
  },
};
let traces = 0;
let activations = 0;
const options = {
  selector: "#v3OpenAuthBtn, #v3BackendBadge",
  onTrace(name) {
    assert.equal(name, "central-auth-click");
    traces += 1;
  },
  onActivate() {
    activations += 1;
  },
};

const first = bindStableAuthDelegation(root, options);
const second = bindStableAuthDelegation(root, options);
assert.equal(first, second, "la delegación debe instalarse una sola vez");
assert.equal(listeners.length, 1);
assert.equal(listeners[0].type, "click");
assert.equal(listeners[0].capture, true);

for (let render = 0; render < 20; render += 1) {
  const replacementButton = {
    id: render % 2 ? "v3BackendBadge" : "v3OpenAuthBtn",
    closest(selector) {
      assert.equal(selector, options.selector);
      return this;
    },
  };
  listeners[0].handler({ target: replacementButton });
}

assert.equal(traces, 20);
assert.equal(activations, 20);
console.log("central-auth-delegation: 20/20 rerenders PASS");
