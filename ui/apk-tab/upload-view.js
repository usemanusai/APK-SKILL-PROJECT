import { el, t } from '../dom.js';

export function renderUploadArea(container, onFileSelected) {
  var dropZone = el('div', {
    className: 'relative rounded-2xl border-2 border-dashed border-white/10 hover:border-cyan-400/40 bg-white/[0.02] p-8 text-center cursor-pointer transition-all',
    id: 'apk-drop-zone',
  });

  var fileInput = el('input', {
    type: 'file',
    id: 'apk-file-input',
    className: 'hidden',
    accept: '.apk,.zip,.xapk,.apks,.aab',
    'aria-label': t('app.apk.uploadAria'),
  });

  dropZone.append(
    el('div', { className: 'text-5xl mb-3', html: '&#128230;' }),
    el('p', { className: 'text-sm font-semibold text-white mb-1' }, t('app.apk.dropHere')),
    el('p', { className: 'text-xs text-slate-500 mb-4' }, t('app.apk.supports')),
    fileInput,
  );

  dropZone.addEventListener('click', function() { fileInput.click(); });
  dropZone.addEventListener('dragover', function(event) {
    event.preventDefault();
    dropZone.classList.add('border-cyan-400/50');
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('border-cyan-400/50');
  });
  dropZone.addEventListener('drop', function(event) {
    event.preventDefault();
    dropZone.classList.remove('border-cyan-400/50');
    var dt = event.dataTransfer;
    var files = dt && dt.files;
    var file = files && files[0];
    if (file) onFileSelected(file);
  });

  fileInput.addEventListener('change', function(event) {
    var files = event.target.files;
    var file = files && files[0];
    if (file) onFileSelected(file);
  });

  container.appendChild(dropZone);

  var formatInfo = el('div', { className: 'grid grid-cols-3 gap-2 mt-3' });
  var formats = [
    { ext: '.apk', label: t('app.apk.formats.apk'), desc: t('app.apk.formats.apkDesc') },
    { ext: '.xapk', label: t('app.apk.formats.xapk'), desc: t('app.apk.formats.xapkDesc') },
    { ext: '.apks', label: t('app.apk.formats.apks'), desc: t('app.apk.formats.apksDesc') },
  ];
  for (var i = 0; i < formats.length; i++) {
    (function(fmt) {
      formatInfo.appendChild(el('div', {
        className: 'rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2 text-center',
      },
        el('span', { className: 'text-xs font-bold text-cyan-300 block' }, fmt.ext),
        el('span', { className: 'text-[10px] text-slate-500' }, fmt.desc),
      ));
    })(formats[i]);
  }
  container.appendChild(formatInfo);
}
