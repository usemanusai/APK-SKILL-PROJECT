// ui/tab-commands-view.js - Renders the quick commands reference
import { el, t, showToast } from './dom.js';

export function renderCommandsTab(container, commands) {
  container.innerHTML = '';

  const searchBar = el('div', { className: 'mb-4' },
    el('input', {
      type: 'text',
      className: 'w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30',
      placeholder: t('app.common.search'),
      id: 'cmd-search',
    })
  );
  container.appendChild(searchBar);

  const list = el('div', { className: 'space-y-2', id: 'cmd-list' });
  container.appendChild(list);

  function renderList(filter = '') {
    const q = filter.toLowerCase().trim();
    const filtered = q
      ? commands.filter(c => c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      : commands;

    list.innerHTML = '';

    if (filtered.length === 0) {
      list.appendChild(el('div', { className: 'text-center py-8 text-slate-500' }, t('app.common.noResults')));
      return;
    }

    filtered.forEach(entry => {
      const row = el('div', { className: 'flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 group hover:border-cyan-400/30 transition-colors' },
        el('div', { className: 'flex-1 min-w-0' },
          el('code', { className: 'text-sm text-cyan-300 font-mono break-all' }, entry.cmd),
          el('div', { className: 'text-xs text-slate-500 mt-1' }, entry.desc)
        ),
        el('button', {
          className: 'shrink-0 p-2 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors',
          'aria-label': t('app.common.copyCode'),
          html: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
          onClick: () => {
            navigator.clipboard.writeText(entry.cmd).then(() => showToast(t('app.common.copied')));
          }
        })
      );
      list.appendChild(row);
    });
  }

  renderList();

  const searchInput = container.querySelector('#cmd-search');
  searchInput.addEventListener('input', (e) => renderList(e.target.value));
}
