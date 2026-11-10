/* Integration checks use the actual generated Safari-9 scripts with an XHR fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parse } = require('acorn');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 25));

function boot(saved = {}, voices = false) {
  const errors = [], requests = [], replies = [], spoken = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(read('ipad/index.html'), { url: 'https://nexus.test/ipad/index.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window;
  w.confirm = () => true;
  w.prompt = (_, fallback) => fallback;
  Object.entries(saved).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.XMLHttpRequest = class {
    open(method, url) { this.method = method; this.url = url; this.headers = {}; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) {
      this.body = body;
      requests.push(this);
      const result = replies.shift() || (this.url.includes('health') ? { json: { ok: true, version: 'integral-1.0', configured: { ai: true } } } : this.url.includes('mobility') ? { json: { available: true, message: 'Datos de prueba', checkedAt: new Date().toISOString(), stops: [{ code: '101', label: 'Parada de prueba', direction: 'I', line: '82' }], arrivals: [{ line: '82', minutes: 7, kind: 'live', destination: 'Centro' }] } } : { json: { reply: 'Respuesta de prueba', actions: [] } });
      if (result.hold) return;
      this.timer = w.setTimeout(() => {
        if (this.aborted) return;
        if (result.network) return this.onerror();
        if (result.timeout) return this.ontimeout();
        this.status = result.status || 200;
        this.responseText = result.raw === undefined ? JSON.stringify(result.json) : result.raw;
        this.onload();
      }, 1);
    }
    abort() { this.aborted = true; w.clearTimeout(this.timer); }
  };
  if (voices) {
    w.SpeechSynthesisUtterance = function(text) { this.text = text; };
    w.speechSynthesis = { getVoices: () => [{ lang: 'es-AR', voiceURI: 'spanish', name: 'Español' }], speak: u => spoken.push(u), cancel: () => {} };
  }
  // Force the missing browser features used by this app, not just the modern path.
  w.eval('Promise=undefined; AbortController=undefined; Object.entries=undefined; Object.assign=undefined; Number.isFinite=undefined; delete Array.prototype.includes; delete Array.prototype.at; delete Array.prototype.find; delete Array.prototype.findIndex; delete String.prototype.padStart; delete String.prototype.startsWith; delete String.prototype.includes; delete Element.prototype.append; delete Element.prototype.closest; delete NodeList.prototype.forEach;');
  ['vendor/promise.min.js', 'compat.js', 'bridge.js', 'workspace.js', 'start.js'].forEach(file => w.eval(read('ipad/' + file)));
  const click = selector => { const n = w.document.querySelector(selector); assert(n, 'Missing ' + selector); n.click(); return n; };
  const form = (selector, values) => {
    const f = w.document.querySelector(selector); assert(f, 'Missing form ' + selector);
    // JSDOM omits native HTMLFormElement named-property shadowing. Emulate Safari/Chrome.
    const idField = f.querySelector('[name="id"]');
    if (idField) Object.defineProperty(f, 'id', { value: idField, configurable: true });
    Object.entries(values).forEach(([k, v]) => { const n = f.querySelector('[name="' + k + '"]'); assert(n, 'Missing field ' + k); if (n.type === 'checkbox') n.checked = v; else n.value = v; });
    f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    if (idField) delete f.id;
  };
  return { dom, w, requests, replies, spoken, errors, click, form, desk: w.NexusDesk, text: () => w.document.body.textContent };
}

async function main() {
  for (const file of ['vendor/promise.min.js', 'compat.js', 'bridge.js', 'workspace.js', 'start.js']) parse(read('ipad/' + file), { ecmaVersion: 5 });
  const ctx = boot();
  const { w, desk, click, form, replies, requests, errors } = ctx;
  try {
    assert(desk, 'Boots using legacy polyfills');
    assert.equal(w.document.querySelectorAll('.nd-tabs button').length, 8);
    assert.equal(requests.length, 0, 'No request or microphone activation at startup');
    assert(w.document.querySelector('[data-nd="repeat"]').disabled);
    for (const tab of ['tasks', 'projects', 'memory', 'mobility', 'routines', 'settings', 'status', 'chat']) { desk.open(tab); }
    click('[data-nd="audio"]');
    assert.match(w.document.querySelector('#legacy-content').textContent, /iOS 9/);
    click('#legacy-close');

    desk.open('projects'); form('#nd-project-form', { name: '<img src=x onerror=alert(1)> Importaciones' }); await pause();
    assert.equal(desk.state.projects.length, 1);
    assert.equal(w.document.querySelectorAll('.nd-body img').length, 0, 'Titles escaped');
    form('.nd-project-note', { text: 'Cotizar auriculares' }); await pause();
    assert.equal(desk.state.projects[0].notes[0], 'Cotizar auriculares');

    desk.open('tasks'); form('#nd-task-form', { title: 'Revisar pedido', date: '2027-01-20T10:00', repeat: 'daily', priority: 'alta' }); await pause();
    assert.equal(desk.state.tasks.length, 1);
    assert.equal(desk.state.tasks[0].projectId, desk.state.activeProject);
    const due = Date.parse(desk.state.tasks[0].dueAt);
    click('[data-nd="task-complete"]');
    assert(Date.parse(desk.state.tasks[0].dueAt) > due);
    assert.equal(desk.state.tasks[0].done, false, 'Recurring task advances');
    desk.addTask({ title: 'Avisar una sola vez', dueAt: new Date(Date.now() - 1000).toISOString() }); desk.tick();
    const overdue = desk.state.tasks[1], notified = overdue.lastNotifiedDue;
    assert.equal(notified, overdue.dueAt); desk.tick(); assert.equal(overdue.lastNotifiedDue, notified);

    desk.open('routines');
    form('#nd-routine-form', { name: 'Mi rutina' }); await pause();
    assert.equal(desk.state.routines.length, 2, 'Reject empty routine');
    const routine = w.document.querySelector('#nd-routine-form');
    routine.querySelector('[value="tasks"]').checked = true; routine.querySelector('[value="study"]').checked = true;
    form('#nd-routine-form', { name: 'Mi rutina' }); await pause();
    assert.deepEqual(Array.from(desk.state.routines[2].steps), ['tasks', 'study'], 'FormData getAll keeps checked choices only');
    click('[data-nd="routine-run"][data-id="' + desk.state.routines[2].id + '"]'); await pause();
    assert(desk.state.activeSession); desk.open('chat');
    click('[data-nd="session-pause"]'); assert.equal(desk.state.activeSession.paused, true);
    click('[data-nd="session-pause"]'); assert.equal(desk.state.activeSession.paused, false);
    click('[data-nd="session-stop"]'); assert.equal(desk.state.activeSession, null); assert.equal(desk.state.sessions.length, 1);

    desk.open('memory'); form('#nd-memory-form', { key: 'ciudad', value: 'Córdoba' }); await pause();
    w.executeAction({ type: 'save_note', text: 'Revisar flete' });
    replies.push({ json: { reply: 'Listo <script>alert(1)</script>', companion: { emotion: 'happy' }, actions: [{ type: 'workspace_action', operation: 'add_task', titulo: 'Pagar proveedor' }, { type: 'create_sheet', name: 'Precios', columns: ['Producto', 'USD'] }, { type: 'add_row', sheet: 'Precios', values: ['Auriculares', '10'] }] } });
    desk.open('chat'); await desk.send('Guardá un pendiente');
    const payload = JSON.parse(requests.at(-1).body);
    assert.equal(requests.at(-1).url, '/api/nexus-brain');
    assert.equal(payload.userPrompt, 'Guardá un pendiente'); assert.equal(payload.notas[0], 'Revisar flete'); assert.equal(payload.facts.ciudad, 'Córdoba');
    assert.equal(payload.workspaceContext.activeProject, desk.state.activeProject);
    assert.equal(desk.state.tasks.at(-1).title, 'Pagar proveedor');
    assert.equal(w.loadSheets().precios.rows[0][1], '10');
    assert.equal(w.document.querySelectorAll('.nd-chat-log script').length, 0, 'Replies rendered as text');
    assert.equal(desk.state.chat.at(-1).role, 'assistant');
    assert.equal(w.loadHistory().at(-1).user, 'Guardá un pendiente');

    for (const failure of [{ status: 503, json: {} }, { json: { error: 'Provider error', reply: 'Fallback' } }, { raw: '<html>bad gateway</html>' }, { timeout: true }, { network: true }]) {
      replies.push(failure); const before = requests.length;
      await desk.send('Conservar borrador');
      assert.equal(w.document.querySelector('#nd-chat-input').value, 'Conservar borrador');
      assert.equal(w.document.querySelector('#nd-chat-form .nd-primary').disabled, false);
      assert.equal(requests.length, before + 1, 'No duplicate sends or retry loop');
    }
    replies.push({ hold: true }); const pending = desk.send('Cancelar consulta'); await pause();
    click('[data-nd="stop"]'); await pending;
    assert.equal(requests.at(-1).aborted, true); assert.equal(w.document.querySelector('#nd-chat-input').value, 'Cancelar consulta');
    await desk.send('Continuar');
    assert.equal(w.document.querySelector('#nd-chat-input').value, '');
    const historyLength = w.loadHistory().length;
    w.confirm = () => false;
    replies.push({ json: { reply: 'Borrado', intent: 'clear_memory' } }); await desk.send('Borrar memoria');
    assert.equal(w.loadHistory().length, historyLength + 1, 'Canceling a history wipe preserves prior turns');
    assert.equal(desk.state.chat.at(-1).text, 'Conservé tu historial de conversación.'); w.confirm = () => true;
    replies.push({ json: { reply: 'Reproduciendo', actions: [{ type: 'play_music', query: 'música', videos: [{ videoId: 'abcdefghijk', title: 'Video de prueba' }] }] } });
    await desk.send('Prepará música');
    assert.match(desk.state.chat.at(-1).text, /Tocá uno/);
    assert.equal(w.document.querySelector('#legacy-content a').href, 'https://www.youtube.com/watch?v=abcdefghijk');
    click('#legacy-close');

    desk.open('mobility'); form('#nd-stop-form', { label: 'Centro', code: '101', direction: 'I', line: '82' }); await pause();
    form('#nd-transit-form', { line: '82', stop: desk.state.stops[0].id }); await pause();
    assert.deepEqual(JSON.parse(requests.at(-1).body), { operation: 'arrivals', line: '82', code: '101', direction: 'I' });
    assert.match(ctx.text(), /Estimación del servicio/);
    click('[data-nd="line-stops"]'); await pause(); assert.match(ctx.text(), /Parada de prueba/);

    desk.open('status'); click('[data-nd="health"]'); await pause();
    assert.equal(requests.at(-1).url, '/api/nexus-brain?health=1'); assert.match(ctx.text(), /integral-1.0/);
    w.executeAction({ type: 'open_url', url: 'javascript:alert(1)' });
    assert.equal(w.document.querySelectorAll('#legacy-content a').length, 0);
    w.executeAction({ type: 'save_fact', key: '__proto__', value: 'blocked' }); assert.equal(w.Object.prototype.blocked, undefined);

    desk.open('memory'); click('[data-nd="legacy-notes"]');
    assert.match(w.document.querySelector('#legacy-content').textContent, /Revisar flete/);
    w.executeAction({ type: 'show_sheet', name: 'Precios' }); assert.equal(w.document.querySelector('#legacy-content td').textContent, 'Auriculares');
    desk.downloadBackup(); const exported = w.document.querySelector('#legacy-content textarea').value, backup = JSON.parse(exported);
    assert.equal(backup.workspace.version, 1); assert.equal(backup.notes[0], 'Revisar flete'); assert.equal(backup.sheets.precios.rows.length, 1);
    desk.addTask({ title: 'Solo temporal' }); assert.equal(desk.state.tasks.length, 4);
    desk.open('memory'); click('[data-nd="import"]');
    w.document.querySelector('#legacy-content textarea').value = exported;
    Array.from(w.document.querySelectorAll('#legacy-content button')).find(b => /Restaurar el texto/.test(b.textContent)).click();
    assert.equal(desk.state.tasks.length, 3, 'JSON paste restore works on legacy Safari');
    assert.equal(w.document.querySelector('#legacy-panel').hidden, true);
    w.confirm = () => false; assert.equal(desk.restore(backup), false); w.confirm = () => true;
    const saved = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); saved[k] = w.localStorage.getItem(k); }
    const reload = boot(saved); try { assert.equal(reload.desk.state.tasks.length, 3); assert.equal(reload.w.loadFacts().ciudad, 'Córdoba'); assert.equal(reload.desk.state.projects.length, 1); } finally { reload.dom.window.close(); }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } finally { ctx.dom.window.close(); }

  const voice = boot({}, true);
  try {
    assert.equal(voice.spoken.length, 0);
    await voice.desk.send('Hola'); assert.equal(voice.spoken.length, 0, 'No unsolicited speech');
    voice.click('[data-nd="repeat"]'); assert.equal(voice.spoken.length, 1); assert.equal(voice.spoken[0].lang, 'es-AR');
    voice.desk.stopSpeech(); voice.desk.speak('Hola '.repeat(90));
    assert(voice.spoken.at(-1).text.length <= 180); assert.equal(voice.spoken.at(-1).voice.voiceURI, 'spanish');
    const count = voice.spoken.length; voice.desk.stopSpeech(); voice.spoken.at(-1).onend(); assert.equal(voice.spoken.length, count, 'Canceled speech does not restart');
    assert.deepEqual(voice.errors, []);
  } finally { voice.dom.window.close(); }
  console.log('PASS: Safari-9 polyfills, all tabs, forms, projects, tasks/recurrence, routines, sessions, chat/API/actions, error draft recovery, cancel, mobility, health, notes/sheets, backups/reload, escaping and optional speech.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
