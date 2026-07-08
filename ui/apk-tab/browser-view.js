import { getState, setState } from '../../state.js';
import { el, t } from '../dom.js';

var COUNT_STYLES = {
  rose: 'ml-auto text-xs text-rose-400',
  cyan: 'ml-auto text-xs text-cyan-400',
  emerald: 'ml-auto text-xs text-emerald-400',
  violet: 'ml-auto text-xs text-violet-400',
  amber: 'ml-auto text-xs text-amber-400',
  blue: 'ml-auto text-xs text-blue-400',
};

export function renderFileBrowser(container, categories) {
  var showBrowser = getState().apkShowFileBrowser || false;

  container.appendChild(el('button', {
    className: 'w-full flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/10 px-4 py-3 text-sm text-slate-400 hover:text-white hover:border-white/20 transition-all mt-4 mb-2',
    onClick: function() { setState({ apkShowFileBrowser: !showBrowser }); },
    'aria-label': t('app.apk.fileBrowser'),
  },
    el('span', { className: 'flex items-center gap-2' },
      el('span', { html: '&#128193;' }),
      el('span', {}, t('app.apk.fileBrowser')),
    ),
    el('span', { html: showBrowser ? '&#9650;' : '&#9660;' }),
  ));

  if (!showBrowser) return;

  var sections = [
    { key: 'manifest', label: t('app.apk.manifest'), icon: '&#128196;', color: 'rose' },
    { key: 'smali', label: t('app.apk.smaliCode'), icon: '&#128196;', color: 'cyan' },
    { key: 'resources', label: t('app.apk.resources'), icon: '&#127912;', color: 'emerald' },
    { key: 'assets', label: t('app.apk.browser.assets'), icon: '&#128230;', color: 'violet' },
    { key: 'dex', label: t('app.apk.dexFiles'), icon: '&#9881;', color: 'amber' },
    { key: 'libs', label: t('app.apk.nativeLibs'), icon: '&#128268;', color: 'blue' },
  ];

  for (var i = 0; i < sections.length; i++) {
    (function(section) {
      var files = categories[section.key] || [];
      if (!files.length) return;

      var groupEl = el('details', { className: 'mb-2' });
      groupEl.appendChild(el('summary', {
        className: 'flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer text-sm font-semibold text-slate-300 hover:text-white transition-colors',
      },
        el('span', { html: section.icon }),
        el('span', {}, section.label),
        el('span', { className: COUNT_STYLES[section.color] }, files.length),
      ));

      var list = el('div', { className: 'ml-4 mt-1 space-y-0.5 max-h-[200px] overflow-y-auto scrollbar-hide' });
      for (var j = 0; j < files.length; j++) {
        var file = files[j];
        var shortPath = file.path.length > 60 ? '...' + file.path.slice(-57) : file.path;
        list.appendChild(el('div', {
          className: 'text-[11px] font-mono text-slate-500 py-0.5 px-2 rounded hover:bg-white/[0.03] truncate',
          title: file.path,
        }, shortPath));
      }

      groupEl.appendChild(list);
      container.appendChild(groupEl);
    })(sections[i]);
  }
}
