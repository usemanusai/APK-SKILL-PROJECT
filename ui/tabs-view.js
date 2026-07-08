// ui/tabs-view.js - Top tab bar rendering
import { getState, setState } from '../state.js';
import { el, t } from './dom.js';

var TABS = [
  { key: 'guides', labelKey: 'app.tabs.guides', icon: '&#128214;' },
  { key: 'modding', labelKey: 'app.tabs.modding', icon: '&#128187;' },
  { key: 'apkImport', labelKey: 'app.tabs.apkImport', icon: '&#128230;', highlight: true },
  { key: 'fileEditor', labelKey: 'app.tabs.fileEditor', icon: '&#9997;' },
  { key: 'aiAssistant', labelKey: 'app.tabs.aiAssistant', icon: '&#129302;' },
  { key: 'commands', labelKey: 'app.tabs.commands', icon: '&#128188;' },
];

export function renderTabs(container) {
  container.innerHTML = '';
  var s = getState();

  var tabWrap = el('div', {
    className: 'flex gap-1 overflow-x-auto pb-2 scrollbar-hide px-1',
    style: '-webkit-overflow-scrolling:touch;',
  });

  for (var i = 0; i < TABS.length; i++) {
    (function(tab) {
      var isActive = s.activeTab === tab.key;
      var isHighlight = tab.highlight;

      var cls;
      if (isActive) {
        cls = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 shadow-lg shadow-cyan-400/10';
      } else if (isHighlight) {
        cls = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 text-amber-300 hover:text-amber-200 hover:bg-amber-400/[0.08] border border-amber-400/20';
      } else {
        cls = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent';
      }

      var btn = el('button', {
        className: cls,
        'aria-selected': String(isActive),
        role: 'tab',
        onClick: function() {
          setState({ activeTab: tab.key, searchQuery: '' });
          renderTabs(container);
        },
      },
        el('span', { html: tab.icon }),
        el('span', {}, t(tab.labelKey))
      );
      tabWrap.appendChild(btn);
    })(TABS[i]);
  }

  container.appendChild(tabWrap);
}
