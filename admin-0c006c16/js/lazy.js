/**
 * <admin>/js/lazy.js  -  code that is read only when a screen needs it
 * LAZY lists, for every part, the files to fetch (styles, texts, scripts) in the order they must run. lazyLoad(name) fetches them one after the other the first time and
 * returns the same answer afterwards, so the first visit of the admin site stays small. The files are ordinary classic scripts of the same global scope: tools/check.py reads this
 * list, so they are checked (names, load order, texts, headers) exactly like the files of the page itself.
 * Loaded by: admin page
 */
'use strict';

const LAZY = {
  labels: ['css/labels-hub.css', 'i18n/labels.en.js', 'i18n/labels.ar.js', 'js/views/labels-kinds.js', 'js/views/labels-render.js', 'js/views/labels-receipts.js', 'js/views/labels-hub.js'],
};
const lazyDone = {};
function lazyLoad(name) {
  if (lazyDone[name]) return lazyDone[name];
  const files = LAZY[name];
  if (!files) return Promise.reject(new Error('lazy: ' + name));
  const one = (f) => new Promise((res, rej) => {
    const el = document.createElement(/\.css$/.test(f) ? 'link' : 'script');
    if (el.tagName === 'LINK') { el.rel = 'stylesheet'; el.href = f; } else el.src = f;
    el.onload = res; el.onerror = () => rej(new Error(t('lazy.fail', { f })));
    document.head.appendChild(el);
  });
  lazyDone[name] = files.reduce((p, f) => p.then(() => one(f)), Promise.resolve()).catch((e) => { delete lazyDone[name]; throw e; });
  return lazyDone[name];
}
