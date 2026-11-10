(function () {
  'use strict';
  var label = document.getElementById('nexus-state');
  if (!window.NexusDesk) { label.textContent = 'No se pudo iniciar NEXUS. Revisá que hayas subido todos los archivos de la carpeta ipad.'; return; }
  label.textContent = 'Listo para conversar';
  document.getElementById('start-chat').onclick = document.getElementById('buddy').onclick = function () { window.NexusDesk.open('chat'); };
  document.getElementById('install').onclick = function () { window.NexusIPad.info('NEXUS en Inicio', 'En Safari, tocá Compartir, elegí Agregar a inicio y confirmá Agregar. Después abrí el ícono NEXUS.'); };
  window.NexusDesk.open('chat');
}());
