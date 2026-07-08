// ui/tab-guides-view.js - Renders guide cards for merged guide tabs
import { getState, setState } from '../state.js';
import { el, t, renderMarkdown } from './dom.js';

export function renderGuideTab(container, guides, sectionKey) {
  var s = getState();
  var q = (s.searchQuery || '').toLowerCase().trim();
  var filtered = q
    ? guides.filter(function(g) {
        return g.title.toLowerCase().indexOf(q) >= 0 ||
               g.content.toLowerCase().indexOf(q) >= 0;
      })
    : guides;

  container.innerHTML = '';

  // Add a small intro for the merged tabs
  if (!q) {
    var intro = el('div', {
      className: 'mb-4 px-1 text-xs text-slate-400'
    });
    if (sectionKey === 'guides') {
      intro.innerHTML = 'Combined: Quick Start • Quick Guides • Detailed Guides';
    } else if (sectionKey === 'modding') {
      intro.innerHTML = 'Combined: Client-Side • Server-Side techniques';
    }
    container.appendChild(intro);
  }

  if (filtered.length === 0) {
    container.appendChild(el('div', { className: 'text-center py-12 text-slate-500' }, t('app.common.noResults')));
    return;
  }

  for (var i = 0; i < filtered.length; i++) {
    (function(guide) {
      var isExpanded = !!s.expandedGuides[guide.id];
      var card = el('div', { className: 'guide-card rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition-all' });

      var diffColors = {
        beginner: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        intermediate: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        advanced: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      };

      var header = el('button', {
        className: 'w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
        'aria-expanded': String(isExpanded),
        onClick: function() {
          var expanded = {};
          var keys = Object.keys(s.expandedGuides);
          for (var k = 0; k < keys.length; k++) { expanded[keys[k]] = s.expandedGuides[keys[k]]; }
          if (expanded[guide.id]) delete expanded[guide.id];
          else expanded[guide.id] = true;
          setState({ expandedGuides: expanded });
        }
      },
        el('span', { className: 'flex-1 text-base font-semibold text-white' }, guide.title),
        el('span', { className: 'text-xs px-2 py-0.5 rounded-full border ' + (diffColors[guide.difficulty] || '') },
          t('app.common.' + guide.difficulty)
        ),
        el('span', { className: 'ml-1 text-slate-500 transition-transform duration-200 ' + (isExpanded ? 'rotate-180' : ''), html: '&#9660;' })
      );

      card.appendChild(header);

      if (isExpanded) {
        var body = el('div', { className: 'px-5 pb-5 guide-body border-t border-white/5 pt-4' });
        body.innerHTML = renderMarkdown(guide.content);

        // Wire copy buttons
        requestAnimationFrame(function() {
          var btns = body.querySelectorAll('.copy-btn');
          for (var b = 0; b < btns.length; b++) {
            (function(btn) {
              btn.addEventListener('click', function() {
                var code = decodeURIComponent(btn.dataset.copy);
                navigator.clipboard.writeText(code).then(function() {
                  btn.textContent = t('app.common.copied');
                  setTimeout(function() { btn.textContent = t('app.common.copyCode'); }, 1500);
                });
              });
            })(btns[b]);
          }
        });

        card.appendChild(body);
      }

      container.appendChild(card);
    })(filtered[i]);
  }
}
