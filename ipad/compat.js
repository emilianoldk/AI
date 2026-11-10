/* Small compatibility layer for Safari 9. All requests remain on the same origin. */
(function (g) {
  'use strict';
  if (!g.globalThis) { g.globalThis = g; }
  if (!Number.isFinite) { Number.isFinite = function (v) { return typeof v === 'number' && isFinite(v); }; }
  if (!Object.assign) { Object.assign = function (target) { var i, source, key; for (i = 1; i < arguments.length; i += 1) { source = arguments[i]; if (source) { for (key in source) { if (Object.prototype.hasOwnProperty.call(source, key) && key !== '__proto__') { target[key] = source[key]; } } } } return target; }; }
  if (!Object.entries) { Object.entries = function (value) { return Object.keys(value).map(function (key) { return [key, value[key]]; }); }; }
  function arrayMethod(name, fn) { if (!Array.prototype[name]) { Object.defineProperty(Array.prototype, name, { value: fn, writable: true, configurable: true }); } }
  arrayMethod('find', function (fn, that) { var i; for (i = 0; i < this.length; i += 1) { if (fn.call(that, this[i], i, this)) { return this[i]; } } });
  arrayMethod('findIndex', function (fn, that) { var i; for (i = 0; i < this.length; i += 1) { if (fn.call(that, this[i], i, this)) { return i; } } return -1; });
  arrayMethod('includes', function (value, from) { var i = Number(from) || 0; if (i < 0) { i = Math.max(0, this.length + i); } for (; i < this.length; i += 1) { if (this[i] === value || this[i] !== this[i] && value !== value) { return true; } } return false; });
  arrayMethod('at', function (index) { index = Number(index) || 0; return this[index < 0 ? this.length + Math.ceil(index) : Math.floor(index)]; });
  if (!String.prototype.includes) { String.prototype.includes = function (value, from) { return this.indexOf(value, from || 0) !== -1; }; }
  if (!String.prototype.startsWith) { String.prototype.startsWith = function (value, from) { from = from || 0; return this.indexOf(value, from) === from; }; }
  if (!String.prototype.padStart) { String.prototype.padStart = function (length, pad) { var value = String(this); pad = pad === undefined ? ' ' : String(pad); if (!pad) { return value; } length = Math.min(10000, Number(length) || 0); while (value.length < length) { value = pad.slice(0, length - value.length) + value; } return value; }; }
  if (g.Element && !Element.prototype.matches) { Element.prototype.matches = Element.prototype.webkitMatchesSelector || Element.prototype.msMatchesSelector; }
  if (g.Element && !Element.prototype.closest) { Element.prototype.closest = function (selector) { var n = this; while (n && n.nodeType === 1) { if (n.matches(selector)) { return n; } n = n.parentElement; } return null; }; }
  if (g.Element && !Element.prototype.append) { Element.prototype.append = function () { var i; for (i = 0; i < arguments.length; i += 1) { this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); } }; }
  if (g.Element && !Element.prototype.remove) { Element.prototype.remove = function () { if (this.parentNode) { this.parentNode.removeChild(this); } }; }
  if (g.NodeList && !NodeList.prototype.forEach) { NodeList.prototype.forEach = Array.prototype.forEach; }
  g.NexusFormData = function (form) {
    this.values = {}; var list = form.elements, i, item, key;
    for (i = 0; i < list.length; i += 1) {
      item = list[i]; key = item.name;
      if (!key || item.disabled || key === '__proto__' || key === 'constructor' || key === 'prototype' || /^(submit|button|reset|file)$/i.test(item.type) || /^(checkbox|radio)$/i.test(item.type) && !item.checked) { continue; }
      if (!Object.prototype.hasOwnProperty.call(this.values, key)) { this.values[key] = []; }
      this.values[key].push(item.value);
    }
  };
  g.NexusFormData.prototype.get = function (key) { var a = this.getAll(key); return a.length ? a[0] : null; };
  g.NexusFormData.prototype.getAll = function (key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key].slice() : []; };
  if (!g.AbortController) {
    g.AbortController = function () { var callbacks = []; this.signal = { aborted: false, addEventListener: function (event, fn) { if (event === 'abort') { callbacks.push(fn); } }, removeEventListener: function (event, fn) { var index = callbacks.indexOf(fn); if (index >= 0) { callbacks.splice(index, 1); } } }; this.abort = function () { if (!this.signal.aborted) { this.signal.aborted = true; callbacks.slice().forEach(function (fn) { fn(); }); } }; };
  }
  // Use XHR even on modern browsers so testing exercises the iPad request path.
  g.fetch = function (url, options) {
    options = options || {};
    return new g.Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(), done = false, watchdog, signal = options.signal, timeout = options.nexusTimeout || 50000;
      function finish(error, value) {
        if (done) { return; } done = true; g.clearTimeout(watchdog);
        if (signal) { signal.removeEventListener('abort', abort); }
        if (error) { reject(error); } else { resolve(value); }
      }
      function abort() { var e = new Error('Consulta interrumpida'); e.name = 'AbortError'; finish(e); xhr.abort(); }
      if (signal && signal.aborted) { abort(); return; }
      xhr.open(options.method || 'GET', String(url), true); xhr.timeout = timeout;
      Object.keys(options.headers || {}).forEach(function (key) { xhr.setRequestHeader(key, options.headers[key]); });
      xhr.onload = function () {
        var value = xhr.responseText, status = xhr.status;
        finish(null, { ok: status >= 200 && status < 300, status: status,
          text: function () { return g.Promise.resolve(value); },
          json: function () { try { return g.Promise.resolve(JSON.parse(value)); } catch (e) { return g.Promise.reject(new Error('El servidor no devolvió JSON válido.')); } } });
      };
      xhr.onerror = function () { finish(new Error('No hay conexión con NEXUS.')); };
      xhr.ontimeout = function () { finish(new Error('NEXUS está tardando en responder. Podés reintentar.')); };
      if (signal) { signal.addEventListener('abort', abort); }
      watchdog = g.setTimeout(function () { finish(new Error('Se agotó el tiempo de espera.')); xhr.abort(); }, timeout + 1000);
      xhr.send(options.body === undefined ? null : options.body);
    });
  };
}(window));
