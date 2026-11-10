/* NEXUS iPad: legacy storage, speech and safe visual actions. */
(function (g) {
  'use strict';
  var speechGeneration = 0, utterance = null, speechTimer = null, sleepTimer = null;
  var keys = { history: 'nexus_conversation_history', notes: 'nexus_notes', sheets: 'nexus_sheets', facts: 'nexus_facts' };
  function el(id) { return document.getElementById(id); }
  function clean(value, max) { return String(value === undefined || value === null ? '' : value).slice(0, max || 20000); }
  function text(node, value) { node.textContent = clean(value, 1000000); }
  function make(tag, value) { var n = document.createElement(tag); if (value !== undefined) { text(n, value); } return n; }
  function empty(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function parse(value) { return JSON.parse(value, function (key, v) { return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : v; }); }
  function read(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? parse(raw) : fallback; } catch (ignore) { return fallback; } }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (ignore) { notice('No se pudo guardar en este iPad. Exportá un respaldo antes de cerrar.'); return false; }
  }
  function notice(value) { text(el('notice'), value); }
  function safeKey(value) {
    var key = clean(value, 120).trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') { throw new Error('Ese nombre no es válido.'); }
    return key;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  g.loadHistory = function () { var value = read(keys.history, []); return Array.isArray(value) ? value.filter(function (x) { return x && typeof x.user === 'string' && typeof x.assistant === 'string'; }).slice(-20) : []; };
  g.saveHistory = function (value) { return write(keys.history, value.slice(-20)); };
  g.addToHistory = function (user, assistant) { var h = g.loadHistory(); h.push({ user: clean(user), assistant: clean(assistant), timestamp: Date.now() }); g.saveHistory(h); };
  g.clearHistory = function () { write(keys.history, []); };
  g.loadNotes = function () { var value = read(keys.notes, []); return Array.isArray(value) ? value.filter(function (x) { return typeof x === 'string'; }) : []; };
  g.saveNotes = function (value) { return write(keys.notes, value); };
  g.loadSheets = function () { return object(read(keys.sheets, {})); };
  g.saveSheets = function (value) { return write(keys.sheets, value); };
  g.loadFacts = function () { return object(read(keys.facts, {})); };
  g.saveFacts = function (value) { return write(keys.facts, value); };

  function modal(title) { text(el('legacy-title'), title); empty(el('legacy-content')); el('legacy-panel').hidden = false; el('legacy-close').focus(); return el('legacy-content'); }
  function info(title, value) { modal(title).appendChild(make('p', value)); }
  function button(parent, label, fn) { var b = make('button', label); b.type = 'button'; b.onclick = fn; parent.appendChild(b); return b; }
  function link(parent, label, url) {
    url = clean(url, 5000).trim();
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url) || /[\u0000-\u001f]/.test(url)) { return false; }
    var a = make('a', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.appendChild(a); return true;
  }
  function textDialog(title, value, filename) {
    var target = modal(title), hint = make('p', 'Podés seleccionar todo el texto y copiarlo.'), area = make('textarea');
    target.appendChild(hint); area.value = value; area.rows = 12; area.readOnly = true; area.setAttribute('aria-label', title); target.appendChild(area);
    button(target, 'Seleccionar / Copiar', function () {
      var copied = false; area.focus(); area.select();
      try { area.setSelectionRange(0, area.value.length); copied = document.execCommand('copy'); } catch (ignore) {}
      text(hint, copied ? 'Texto copiado.' : 'Mantené presionado el texto y elegí Seleccionar todo → Copiar.');
    });
    if (filename) {
      var a = make('a', 'Abrir archivo para guardar o compartir'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(value); a.download = filename; a.target = '_blank'; a.rel = 'noopener'; target.appendChild(a);
    }
    return area;
  }
  function backup(value) { textDialog('Respaldo completo de NEXUS', JSON.stringify(value, null, 2), 'NEXUS-respaldo.json'); }
  function importBackup(restore) {
    var target = modal('Restaurar respaldo'), area = make('textarea'), file = make('input');
    target.appendChild(make('p', 'Pegá el JSON de un respaldo de NEXUS o elegí su archivo. Al restaurarlo se pedirá confirmar el reemplazo de los datos locales.'));
    area.rows = 10; area.setAttribute('aria-label', 'JSON del respaldo'); target.appendChild(area);
    function apply(value) {
      try { if (value.length > 10 * 1024 * 1024) { throw new Error('El respaldo supera 10 MB.'); } if (restore(parse(value))) { el('legacy-panel').hidden = true; notice('Respaldo restaurado.'); } }
      catch (e) { notice('No se pudo restaurar: ' + e.message); }
    }
    button(target, 'Restaurar el texto pegado', function () { apply(area.value); });
    file.type = 'file'; file.accept = '.json,application/json'; file.setAttribute('aria-label', 'Archivo de respaldo');
    file.onchange = function () { var f = file.files && file.files[0]; if (!f) { return; } if (f.size > 10 * 1024 * 1024) { notice('El respaldo supera 10 MB.'); return; } var reader = new FileReader(); reader.onload = function () { apply(String(reader.result)); }; reader.onerror = function () { notice('No se pudo leer ese archivo.'); }; reader.readAsText(f); };
    target.appendChild(file);
  }
  function notesDialog() {
    var target = modal('Notas y hojas'), input = make('textarea'), notes = g.loadNotes(), list = make('div');
    input.rows = 3; input.maxLength = 5000; input.placeholder = 'Nueva nota'; input.setAttribute('aria-label', 'Nueva nota'); target.appendChild(input);
    button(target, 'Guardar nota', function () { var value = input.value.trim(); if (!value) { return; } var all = g.loadNotes(); all.push(value); g.saveNotes(all); notesDialog(); });
    notes.forEach(function (value, index) { var card = make('section'); card.className = 'legacy-card'; card.appendChild(make('p', value)); button(card, 'Quitar nota', function () { if (g.confirm('¿Quitar esta nota?')) { var all = g.loadNotes(); all.splice(index, 1); g.saveNotes(all); notesDialog(); } }); list.appendChild(card); });
    if (!notes.length) { list.appendChild(make('p', 'Todavía no hay notas.')); }
    target.appendChild(list); target.appendChild(make('h3', 'Hojas guardadas'));
    var sheets = g.loadSheets(); Object.keys(sheets).forEach(function (key) { var sheet = sheets[key]; if (sheet && typeof sheet === 'object') { button(target, clean(sheet.name || key), function () { showSheet(key); }); } });
    if (!Object.keys(sheets).length) { target.appendChild(make('p', 'Podés pedirle a NEXUS que cree una hoja por chat.')); }
  }
  function showSheet(name) {
    var sheets = g.loadSheets(), sheet = sheets[clean(name).toLowerCase()];
    if (!sheet) { notice('No encontré esa hoja.'); return; }
    var target = modal(clean(sheet.name || name)), table = make('table'), tr = make('tr');
    (sheet.columns || []).slice(0, 30).forEach(function (c) { tr.appendChild(make('th', c)); }); table.appendChild(tr);
    (sheet.rows || []).slice(0, 100).forEach(function (row) { var r = make('tr'); (Array.isArray(row) ? row : [row]).slice(0, 30).forEach(function (c) { r.appendChild(make('td', c)); }); table.appendChild(r); });
    target.appendChild(table);
    if ((sheet.rows || []).length > 100) { target.appendChild(make('p', 'Se muestran las primeras 100 filas. El respaldo conserva todas.')); }
    button(target, 'Exportar valores CSV', function () { exportSheet(name); });
  }
  function exportSheet(name) {
    var sheet = g.loadSheets()[clean(name).toLowerCase()]; if (!sheet) { notice('No encontré esa hoja.'); return; }
    var rows = [sheet.columns || []].concat(sheet.rows || []), csv = rows.map(function (row) { return (Array.isArray(row) ? row : [row]).map(function (v) { var s = clean(v); if (/^[=+@\-\t\r]/.test(s)) { s = "'" + s; } return '"' + s.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    textDialog('CSV · ' + clean(sheet.name || name), csv);
  }
  function dateLabel(value) { var d = new Date(value); function pad(v) { return v < 10 ? '0' + v : String(v); } return isNaN(d.getTime()) ? 'Sin fecha' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function stopSpeech() { speechGeneration += 1; g.clearTimeout(speechTimer); if (g.speechSynthesis) { g.speechSynthesis.cancel(); } utterance = null; setState('dormant'); }
  function speak(value) {
    if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) { info('Lectura en voz alta', 'Safari no ofrece una voz disponible en este dispositivo. La respuesta queda escrita en el chat.'); return; }
    stopSpeech();
    var textValue = clean(value, 6000).replace(/[*#]/g, '').trim(), parts = [], generation = speechGeneration, pref = g.NexusDesk ? g.NexusDesk.preferences() : {};
    while (textValue) { var end = Math.min(180, textValue.length), split = textValue.lastIndexOf(' ', end); if (end < textValue.length && split > 50) { end = split; } parts.push(textValue.slice(0, end)); textValue = textValue.slice(end).trim(); }
    function next() {
      if (generation !== speechGeneration) { return; }
      if (!parts.length) { setState('dormant'); return; }
      utterance = new SpeechSynthesisUtterance(parts.shift()); utterance.lang = 'es-AR'; utterance.rate = Math.max(.6, Math.min(1.5, Number(pref.rate) || 1.05));
      var voices = g.speechSynthesis.getVoices ? g.speechSynthesis.getVoices() : [], chosen = voices.find(function (v) { return pref.voiceURI && v.voiceURI === pref.voiceURI; }) || voices.find(function (v) { return /^es[-_]/i.test(v.lang); });
      if (chosen) { utterance.voice = chosen; }
      utterance.onend = function () { g.clearTimeout(speechTimer); next(); };
      utterance.onerror = function () { stopSpeech(); notice('La lectura se interrumpió. Podés volver a tocar Escuchar.'); };
      setState('speaking');
      speechTimer = g.setTimeout(function () { if (generation === speechGeneration) { stopSpeech(); notice('Safari interrumpió la lectura. Tocá Escuchar para intentarlo de nuevo.'); } }, 22000);
      g.speechSynthesis.speak(utterance);
    }
    next();
  }
  function setState(value) { var labels = { processing: 'Pensando…', speaking: 'Hablando', alert: 'No pude completar la consulta', dormant: 'Listo para conversar' }; text(el('nexus-state'), labels[value] || 'Listo para conversar'); document.body.setAttribute('data-state', value); }
  g.setState = setState; g.backToDormant = function () { setState('dormant'); }; g.stopNexusSpeech = stopSpeech;
  g.speakOutLoudStreaming = function (sentences) { speak(sentences.join(' ')); };
  g.showManagePanel = notesDialog;
  g.initAudio = function () { info('Voz en el iPad 2', 'Esta versión conversa por texto. iOS 9 no permite la grabación de micrófono que utiliza NEXUS ni la activación con “Hey Nexus”. Si Safari ofrece voces, el botón Escuchar lee la última respuesta.'); };
  g.NexusBuddy = { applyCompanion: function (visual) {
    visual = visual || {}; var emotion = clean(visual.emotion, 30), accessories = { umbrella: '☂', witch_hat: '✦', glasses: '⌘', headphones: '♫', scarf: '≈' };
    el('buddy').className = 'buddy' + (/^(happy|curious|thoughtful|surprised|concerned|amused|empathetic)$/.test(emotion) ? ' emotion-' + emotion : '');
    text(el('accessory'), accessories[visual.accessory] || '');
  } };
  function mediaActions(action) {
    var target = modal(action.type === 'play_music' ? 'Música · Abrir en YouTube' : clean(action.title || action.query || 'Resultado'));
    if (action.panelType === 'text') { target.appendChild(make('p', action.content || '')); if (action.source) { link(target, 'Fuente', action.source); } return; }
    if (action.panelType === 'map') { link(target, 'Abrir mapa', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(action.query || '')); return; }
    var videos = Array.isArray(action.videos) ? action.videos : [];
    videos.slice(0, 8).forEach(function (v) { var id = clean(v.videoId || v.id, 30); if (/^[A-Za-z0-9_-]{11}$/.test(id)) { link(target, clean(v.title || 'Abrir video'), 'https://www.youtube.com/watch?v=' + id); } });
    if (!videos.length) {
      if (action.panelType === 'image') { link(target, 'Buscar imágenes', 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(action.query || '')); }
      else if (action.panelType === 'weather') { button(target, 'Consultar pronóstico por chat', function () { el('legacy-panel').hidden = true; g.NexusDesk.open('chat'); g.NexusDesk.send('pronóstico extendido de ' + (action.query || 'Córdoba')); }); }
      else { link(target, 'Buscar en YouTube', 'https://www.youtube.com/results?search_query=' + encodeURIComponent(action.query || '')); }
    }
    target.appendChild(make('p', 'La reproducción se abre aparte y depende de la compatibilidad del servicio con tu navegador.'));
  }
  g.executeAction = function (action) {
    try {
      var all, key, value;
      switch (action.type) {
        case 'workspace_action': g.NexusDesk.action(action); break;
        case 'save_note': all = g.loadNotes(); value = clean(action.text, 5000).trim(); if (value) { all.push(value); g.saveNotes(all); notice('Nota guardada.'); } break;
        case 'delete_note': all = g.loadNotes(); if (action.index >= 0 && action.index < all.length && g.confirm('¿Quitar la nota indicada?')) { all.splice(action.index, 1); g.saveNotes(all); } break;
        case 'clear_notes': if (g.confirm('¿Quitar todas las notas de este navegador?')) { g.saveNotes([]); } break;
        case 'save_fact': all = g.loadFacts(); key = safeKey(action.key); all[key] = clean(typeof action.value === 'object' ? JSON.stringify(action.value) : action.value, 3000); g.saveFacts(all); break;
        case 'create_sheet': all = g.loadSheets(); key = safeKey(action.name).toLowerCase(); all[key] = { name: clean(action.name, 120), columns: (Array.isArray(action.columns) ? action.columns : []).slice(0, 30).map(function (x) { return clean(x, 200); }), rows: [], createdAt: Date.now() }; g.saveSheets(all); break;
        case 'add_row': all = g.loadSheets(); key = safeKey(action.sheet).toLowerCase(); if (!all[key]) { throw new Error('No encontré esa hoja.'); } if (!Array.isArray(all[key].rows)) { all[key].rows = []; } all[key].rows.push((Array.isArray(action.values) ? action.values : []).slice(0, 30).map(function (x) { return clean(x, 2000); })); g.saveSheets(all); break;
        case 'delete_sheet': key = safeKey(action.name).toLowerCase(); if (g.confirm('¿Quitar la hoja ' + key + '?')) { all = g.loadSheets(); delete all[key]; g.saveSheets(all); } break;
        case 'show_sheet': showSheet(action.name); break;
        case 'export_sheet': exportSheet(action.name); break;
        case 'open_url': var target = modal('Enlace solicitado'); if (!link(target, 'Abrir enlace', action.url)) { target.appendChild(make('p', 'El enlace recibido no es válido.')); } break;
        case 'copy_to_clipboard': case 'share': textDialog(action.title || 'Texto para copiar', clean(action.text)); break;
        case 'set_timer': value = Number(action.minutes); if (!isFinite(value) || value <= 0 || value > 1440) { throw new Error('Indicá una duración válida.'); } g.NexusDesk.addTask({ title: clean(action.message || 'Temporizador'), dueAt: new Date(Date.now() + value * 60000).toISOString(), repeat: 'none' }); notice('Temporizador guardado. El aviso requiere NEXUS abierto.'); break;
        case 'focus_mode': document.body.classList.toggle('nexus-focus', !!action.active); break;
        case 'sleep_mode': document.body.classList.add('nexus-rest'); g.clearTimeout(sleepTimer); sleepTimer = g.setTimeout(function () { document.body.classList.remove('nexus-rest'); }, Math.max(1, Math.min(180, Number(action.minutes) || 30)) * 60000); break;
        case 'clear_panels': el('legacy-panel').hidden = true; break;
        case 'show_panel': case 'play_music': mediaActions(action); break;
        case 'music_control': notice('Usá los controles de la pestaña de música que abriste.'); break;
        default: notice('Esta acción no está disponible en la vista iPad: ' + clean(action.type, 60));
      }
    } catch (e) { notice(e.message); }
  };
  g.NexusIPad = {
    info: info, speak: speak, backup: backup, importBackup: importBackup, dateLabel: dateLabel,
    request: function (payload, signal) {
      return g.fetch('/api/nexus-brain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: signal }).then(function (response) {
        if (!response.ok) { throw new Error('El servidor de NEXUS respondió HTTP ' + response.status + '.'); }
        return response.json();
      }).then(function (response) {
        if (!response || response.error || typeof response.reply !== 'string' || !response.reply.trim()) { throw new Error('NEXUS no pudo completar la consulta. Podés revisar el servidor en Estado y reintentar.'); }
        var actions = Array.isArray(response.actions) ? response.actions : [];
        if (actions.some(function (a) { return a.type === 'play_music'; })) { response.reply = 'Te preparé los enlaces de música. Tocá uno para abrir el reproductor.'; }
        if (actions.some(function (a) { return a.type === 'music_control'; })) { response.reply = 'Para controlar la música, usá la pestaña del reproductor que abriste.'; }
        if (response.intent === 'clear_memory') {
          if (g.confirm('¿Borrar el historial de conversación de este navegador? Las notas y pendientes se conservan.')) { g.clearHistory(); if (g.NexusDesk) { g.NexusDesk.state.chat = []; write('nexus.workspace.v1', g.NexusDesk.state); } response.reply = 'Borré el historial de conversación de este navegador. Tus notas, proyectos y pendientes siguen guardados.'; }
          else { response.reply = 'Conservé tu historial de conversación.'; }
        }
        return response;
      });
    },
    afterRender: function (panel, tab) {
      var audio = panel.querySelector('[data-nd="audio"]'), repeat = panel.querySelector('[data-nd="repeat"]');
      if (audio) { text(audio, 'Voz en este iPad'); }
      if (repeat) { text(repeat, 'Escuchar'); repeat.disabled = !g.speechSynthesis || !g.SpeechSynthesisUtterance; }
      if (tab === 'status') { var note = make('p', 'Vista iPad: conversación por texto. Micrófono y “Hey Nexus” no están disponibles en iOS 9. Escuchar utiliza la voz que ofrezca Safari.'); note.className = 'nd-small'; panel.querySelector('.nd-body').appendChild(note); }
    }
  };
  el('legacy-close').onclick = function () { el('legacy-panel').hidden = true; };
  document.addEventListener('keydown', function (event) { if (event.keyCode === 27) { el('legacy-panel').hidden = true; } }, false);
}(window));
