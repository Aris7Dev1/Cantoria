const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const PRELOAD_PATH = path.join(__dirname, "..", "preload.js");

/* Charge preload.js avec un electron mocké : capture l'objet exposé via
   contextBridge.exposeInMainWorld et les canaux IPC invoqués/abonnés. */
function loadPreload() {
  const calls = { invoke: [], on: [], removeListener: [] };
  const exposed = {};
  const electronMock = {
    contextBridge: {
      exposeInMainWorld: (name, api) => {
        exposed[name] = api;
      },
    },
    ipcRenderer: {
      invoke: (channel, ...args) => {
        calls.invoke.push({ channel, args });
        return Promise.resolve({ channel, args });
      },
      on: (channel, listener) => {
        calls.on.push({ channel, listener });
      },
      removeListener: (channel, listener) => {
        calls.removeListener.push({ channel, listener });
      },
    },
  };

  const code = fs.readFileSync(PRELOAD_PATH, "utf8");
  const mod = new Module(PRELOAD_PATH, module);
  mod.filename = PRELOAD_PATH;
  mod.paths = Module._nodeModulePaths(path.dirname(PRELOAD_PATH));
  mod.require = (id) => (id === "electron" ? electronMock : require(id));
  mod._compile(code, PRELOAD_PATH);

  return { exposed, calls };
}

test("le preload expose les trois fonctions de zoom sur window.carnetDesktop", () => {
  const { exposed } = loadPreload();
  const api = exposed.carnetDesktop;
  assert.ok(api, "window.carnetDesktop exposé");
  assert.equal(typeof api.setZoomFactor, "function", "setZoomFactor exposé");
  assert.equal(typeof api.getZoomFactor, "function", "getZoomFactor exposé");
  assert.equal(typeof api.onZoomChanged, "function", "onZoomChanged exposé");
  assert.ok(Object.isFrozen(api), "l'objet exposé est gelé");
});

test("setZoomFactor invoque le canal zoom:set avec le facteur", async () => {
  const { exposed, calls } = loadPreload();
  await exposed.carnetDesktop.setZoomFactor(1.5);
  assert.deepEqual(calls.invoke, [{ channel: "zoom:set", args: [1.5] }]);
});

test("getZoomFactor invoque le canal zoom:get sans argument", async () => {
  const { exposed, calls } = loadPreload();
  await exposed.carnetDesktop.getZoomFactor();
  assert.deepEqual(calls.invoke, [{ channel: "zoom:get", args: [] }]);
});

test("onZoomChanged s'abonne à zoom:changed et la fonction retournée désabonne", () => {
  const { exposed, calls } = loadPreload();
  const received = [];
  const unsubscribe = exposed.carnetDesktop.onZoomChanged((f) => received.push(f));

  assert.equal(calls.on.length, 1, "un abonnement posé");
  assert.equal(calls.on[0].channel, "zoom:changed");
  assert.equal(typeof unsubscribe, "function", "la fonction de désabonnement est retournée");

  // Le listener enveloppe le callback : le payload seul lui est transmis.
  calls.on[0].listener(null, 1.3);
  assert.deepEqual(received, [1.3]);

  unsubscribe();
  assert.equal(calls.removeListener.length, 1, "le désabonnement retire le listener");
  assert.equal(calls.removeListener[0].channel, "zoom:changed");
  assert.equal(calls.removeListener[0].listener, calls.on[0].listener,
    "c'est le même listener qui est retiré");
});

test("onZoomChanged refuse un callback qui n'est pas une fonction", () => {
  const { exposed } = loadPreload();
  assert.throws(() => exposed.carnetDesktop.onZoomChanged(null), TypeError);
});
