// ui/settings-view.js - AI Provider Settings dashboard (modal overlay).
//
// Lets the user switch between the built-in miniapps.ai models and their own
// OpenRouter.ai account: manage a pool of API keys (rotated automatically),
// browse the live OpenRouter model catalog, and pick a default model. The
// last model picked here is remembered per-provider (see ai-settings-storage.js)
// so it comes back automatically on the next visit.

import { getState, setState } from '../state.js';
import { el, showToast } from './dom.js';
import * as aiProvider from './ai-provider.js';
import * as aiSettings from './ai-settings-storage.js';

var overlayEl = null;

export function isSettingsOpen() {
  return !!overlayEl;
}

export function openSettingsModal(opts) {
  if (overlayEl) return; // already open
  opts = opts || {};

  var saved = aiSettings.getSettings();
  var view = {
    provider: saved.provider,
    keys: saved.keys.slice(),
    pendingModelId: getState().selectedModelId,
    models: getState().availableModels || [],
    loadingModels: false,
    modelsError: null,
    keyTestStatus: {}, // key -> 'testing' | 'ok' | 'error message'
  };

  overlayEl = el('div', {
    className: 'fixed inset-0 z-[200] flex items-start sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm px-3 py-6 overflow-y-auto',
    onClick: function(e) { if (e.target === overlayEl) close(); },
  });

  var panel = el('div', {
    className: 'settings-panel-enter w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]',
  });
  overlayEl.appendChild(panel);
  document.body.appendChild(overlayEl);

  function close() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }

  function render() {
    panel.innerHTML = '';
    panel.appendChild(buildHeader());
    var body = el('div', { className: 'px-6 py-5 overflow-y-auto scrollbar-hide flex-1' });
    body.appendChild(buildProviderToggle());
    if (view.provider === 'openrouter') {
      body.appendChild(buildKeysSection());
      body.appendChild(buildModelSection());
    } else {
      body.appendChild(buildBuiltinInfo());
    }
    panel.appendChild(body);
    panel.appendChild(buildFooter());
  }

  function buildHeader() {
    var header = el('div', { className: 'flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0' });
    header.appendChild(
      el('div', {},
        el('h2', { className: 'text-lg font-bold text-white flex items-center gap-2' },
          el('span', { html: '&#9881;&#65039;' }),
          'AI Provider Settings',
        ),
        el('p', { className: 'text-xs text-slate-500 mt-0.5' }, 'Choose which AI backend powers every tab in this app.'),
      ),
    );
    header.appendChild(el('button', {
      className: 'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors',
      'aria-label': 'Close settings',
      onClick: function() { close(); },
    }, '\u2715'));
    return header;
  }

  function buildProviderToggle() {
    var wrap = el('div', { className: 'mb-5' });
    wrap.appendChild(el('label', { className: 'block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2' }, 'Model Backend'));
    var row = el('div', { className: 'grid grid-cols-2 gap-2' });

    row.appendChild(buildProviderCard({
      key: 'builtin',
      title: 'Built-in Models',
      desc: 'Curated models, billed in app credits.',
      icon: '&#9889;',
    }));
    row.appendChild(buildProviderCard({
      key: 'openrouter',
      title: 'OpenRouter.ai',
      desc: 'Bring your own key(s), 400+ live models.',
      icon: '&#128279;',
    }));

    wrap.appendChild(row);
    return wrap;
  }

  function buildProviderCard(cfg) {
    var isActive = view.provider === cfg.key;
    var cardCls = 'text-left rounded-xl border px-4 py-3 transition-all ' +
      (isActive
        ? 'bg-cyan-400/10 border-cyan-400/40 shadow-lg shadow-cyan-400/5'
        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]');
    return el('button', {
      className: cardCls,
      onClick: function() {
        view.provider = cfg.key;
        if (cfg.key === 'openrouter' && view.models.length === 0) {
          fetchModels(false);
        }
        render();
      },
    },
      el('div', { className: 'flex items-center gap-2' },
        el('span', { html: cfg.icon }),
        el('span', { className: 'text-sm font-semibold ' + (isActive ? 'text-cyan-200' : 'text-white') }, cfg.title),
        isActive ? el('span', { className: 'ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-400/20 text-cyan-300 font-bold' }, 'ACTIVE') : null,
      ),
      el('p', { className: 'text-[11px] text-slate-500 mt-1 leading-snug' }, cfg.desc),
    );
  }

  function buildBuiltinInfo() {
    return el('div', { className: 'rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-slate-400 leading-relaxed' },
      'Using the platform\u2019s built-in model catalog. Switch to OpenRouter.ai above to bring your own API key(s) and pick from the full live model list instead.',
    );
  }

  function maskKey(key) {
    if (key.length <= 10) return key.slice(0, 3) + '\u2026';
    return key.slice(0, 8) + '\u2026' + key.slice(-4);
  }

  function buildKeysSection() {
    var wrap = el('div', { className: 'mb-5' });
    wrap.appendChild(el('label', { className: 'block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2' }, 'API Keys (rotated automatically)'));

    var list = el('div', { className: 'space-y-1.5 mb-2' });
    if (view.keys.length === 0) {
      list.appendChild(el('p', { className: 'text-xs text-slate-500 italic' }, 'No keys added yet \u2014 add at least one OpenRouter API key below.'));
    } else {
      for (var i = 0; i < view.keys.length; i++) {
        (function(key, idx) {
          var status = view.keyTestStatus[key];
          var row = el('div', { className: 'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2' });
          row.appendChild(el('span', { className: 'text-[10px] font-bold text-slate-600 w-4' }, String(idx + 1)));
          row.appendChild(el('code', { className: 'flex-1 text-xs text-slate-300 font-mono truncate' }, maskKey(key)));
          if (status === 'testing') {
            row.appendChild(el('span', { className: 'text-[10px] text-slate-500' }, 'testing\u2026'));
          } else if (status === 'ok') {
            row.appendChild(el('span', { className: 'text-[10px] text-emerald-400 font-semibold' }, '\u2713 valid'));
          } else if (status) {
            row.appendChild(el('span', { className: 'text-[10px] text-rose-400 font-semibold', title: status }, '\u2717 error'));
          }
          row.appendChild(el('button', {
            className: 'text-[10px] px-2 py-1 rounded-md bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors',
            onClick: function() {
              view.keyTestStatus[key] = 'testing';
              render();
              aiProvider.validateOpenRouterKey(key).then(function(info) {
                view.keyTestStatus[key] = 'ok';
                var remaining = (info && info.limit_remaining != null) ? (' \u2014 $' + Number(info.limit_remaining).toFixed(2) + ' remaining') : '';
                showToast('Key valid' + remaining);
                render();
              }).catch(function(err) {
                view.keyTestStatus[key] = err.message || 'Invalid key';
                render();
              });
            },
          }, 'Test'));
          row.appendChild(el('button', {
            className: 'text-[10px] px-2 py-1 rounded-md bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors',
            onClick: function() {
              view.keys.splice(idx, 1);
              delete view.keyTestStatus[key];
              render();
            },
          }, 'Remove'));
          list.appendChild(row);
        })(view.keys[i], i);
      }
    }
    wrap.appendChild(list);

    var addRow = el('div', { className: 'flex gap-2' });
    var input = el('input', {
      type: 'password',
      className: 'flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 font-mono',
      placeholder: 'sk-or-v1-\u2026',
      'aria-label': 'New OpenRouter API key',
    });
    function addKey() {
      var val = input.value.trim();
      if (!val) return;
      if (view.keys.indexOf(val) >= 0) { showToast('Key already added'); return; }
      view.keys.push(val);
      input.value = '';
      render();
    }
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); addKey(); } });
    addRow.appendChild(input);
    addRow.appendChild(el('button', {
      className: 'shrink-0 rounded-lg bg-cyan-400/15 border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/25 transition-colors',
      onClick: addKey,
    }, '+ Add Key'));
    wrap.appendChild(addRow);

    wrap.appendChild(el('p', { className: 'text-[11px] text-slate-600 mt-2 leading-relaxed' },
      'Add multiple keys to spread usage across accounts. Every request round-robins to the next key, and automatically fails over to the next one on rate limits or errors. Keys are stored only in this browser.',
    ));
    return wrap;
  }

  function fetchModels(force) {
    view.loadingModels = true;
    view.modelsError = null;
    render();
    aiProvider.listModels({ forceRefresh: force }).then(function(result) {
      view.models = result.models || [];
      view.loadingModels = false;
      render();
    }).catch(function(err) {
      view.loadingModels = false;
      view.modelsError = err.message || 'Failed to load models';
      render();
    });
  }

  function buildModelSection() {
    var wrap = el('div', { className: 'mb-2' });
    var labelRow = el('div', { className: 'flex items-center justify-between mb-2' });
    labelRow.appendChild(el('label', { className: 'text-xs font-semibold uppercase tracking-widest text-slate-500' }, 'Default Model'));
    labelRow.appendChild(el('button', {
      className: 'text-[10px] px-2 py-1 rounded-md bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors flex items-center gap-1',
      onClick: function() { fetchModels(true); },
    }, view.loadingModels ? 'Fetching\u2026' : '\u21bb Refresh Live List'));
    wrap.appendChild(labelRow);

    if (view.modelsError) {
      wrap.appendChild(el('p', { className: 'text-xs text-rose-400 mb-2' }, view.modelsError));
    }

    var searchInput = el('input', {
      type: 'text',
      className: 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 mb-2',
      placeholder: 'Search live OpenRouter models\u2026',
    });
    wrap.appendChild(searchInput);

    var listWrap = el('div', { className: 'rounded-lg border border-white/10 bg-white/[0.02] max-h-[220px] overflow-y-auto scrollbar-hide' });
    wrap.appendChild(listWrap);

    function renderList(filter) {
      var q = (filter || '').toLowerCase().trim();
      var models = view.models;
      var filtered = !q ? models : models.filter(function(m) {
        return m.title.toLowerCase().indexOf(q) >= 0 || m.id.toLowerCase().indexOf(q) >= 0;
      });

      listWrap.innerHTML = '';
      if (view.loadingModels) {
        listWrap.appendChild(el('div', { className: 'px-4 py-6 text-center text-xs text-slate-500' }, 'Fetching today\u2019s live model list from OpenRouter\u2026'));
        return;
      }
      if (filtered.length === 0) {
        listWrap.appendChild(el('div', { className: 'px-4 py-6 text-center text-xs text-slate-500' }, models.length === 0 ? 'No models loaded yet.' : 'No models match your search.'));
        return;
      }

      for (var i = 0; i < filtered.length; i++) {
        (function(m) {
          var isActive = m.id === view.pendingModelId;
          var row = el('button', {
            className: 'flex items-center gap-2 w-full text-left px-3 py-2 border-b border-white/5 last:border-b-0 transition-colors ' +
              (isActive ? 'bg-cyan-400/10 text-cyan-200' : 'hover:bg-white/[0.04] text-slate-300'),
            onClick: function() { view.pendingModelId = m.id; renderList(searchInput.value); },
          });
          row.appendChild(el('span', { className: 'text-[10px] w-4 shrink-0 ' + (isActive ? 'text-cyan-300' : 'text-slate-600') }, isActive ? '\u2713' : ''));
          var info = el('div', { className: 'flex-1 min-w-0' });
          info.appendChild(el('div', { className: 'text-xs font-semibold truncate' }, m.title));
          info.appendChild(el('div', { className: 'text-[10px] text-slate-500 truncate' }, m.id + (m.isFree ? ' \u00b7 free' : '')));
          row.appendChild(info);
          if (m.contextLength) {
            row.appendChild(el('span', { className: 'text-[10px] text-slate-600 shrink-0' }, Math.round(m.contextLength / 1000) + 'K ctx'));
          }
          listWrap.appendChild(row);
        })(filtered[i]);
      }
    }

    searchInput.addEventListener('input', function(e) { renderList(e.target.value); });
    renderList('');

    if (view.models.length === 0 && !view.loadingModels && !view.modelsError) {
      fetchModels(false);
    }

    return wrap;
  }

  function buildFooter() {
    var footer = el('div', { className: 'flex items-center justify-between gap-2 px-6 py-4 border-t border-white/10 shrink-0' });
    footer.appendChild(el('button', {
      className: 'text-xs text-slate-500 hover:text-slate-300 transition-colors',
      onClick: function() { close(); },
    }, 'Cancel'));

    footer.appendChild(el('button', {
      className: 'rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition-colors',
      onClick: function() {
        if (view.provider === 'openrouter' && view.keys.length === 0) {
          showToast('Add at least one OpenRouter API key first');
          return;
        }
        aiSettings.setProvider(view.provider);
        aiSettings.setKeys(view.keys);
        if (view.provider === 'openrouter' && view.pendingModelId) {
          setState({
            selectedModelId: view.pendingModelId,
            aiModelId: view.pendingModelId,
            apkChatModelId: view.pendingModelId,
          });
        }
        close();
        showToast('AI provider settings saved');
        if (typeof opts.onSaved === 'function') opts.onSaved();
      },
    }, 'Save & Apply'));
    return footer;
  }

  render();
}
