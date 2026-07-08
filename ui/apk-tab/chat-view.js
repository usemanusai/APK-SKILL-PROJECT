// ui/apk-tab/chat-view.js - APK Chat UI: model selector, messages, follow-ups, history
import { getState, setState } from '../../state.js';
import { el, t, renderMarkdown, showToast } from '../dom.js';
import {
  sendApkChatMessage,
  clearChatHistory,
  retryApkChatMessage,
  loadChatHistory,
} from './chat-controller.js';

var chatInitialized = false;

export function initApkChat() {
  if (chatInitialized) return Promise.resolve();
  chatInitialized = true;
  return loadChatHistory();
}

export function destroyApkChat() {
  // no-op for now
}

export function renderApkChatPanel(container) {
  var s = getState();
  var apk = s.apkFile;
  if (!apk) return;

  var panel = el('div', {
    className: 'mb-6 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-400/[0.04] to-cyan-400/[0.04] overflow-hidden',
    id: 'apk-chat-panel',
  });

  panel.appendChild(buildChatHeader(s));

  var body = el('div', { className: 'p-4' });
  body.appendChild(buildModelSelector(s));
  body.appendChild(buildMessagesArea(s));

  if ((s.apkChatFollowUps || []).length > 0 && !s.apkChatLoading) {
    body.appendChild(buildFollowUps(s));
  }

  body.appendChild(buildInputArea(s));

  panel.appendChild(body);
  container.appendChild(panel);

  setTimeout(function() {
    var area = document.getElementById('apk-chat-messages');
    if (area) area.scrollTop = area.scrollHeight;
    var input = document.getElementById('apk-chat-input');
    if (input && !s.apkChatLoading) input.focus();
  }, 50);
}

function buildChatHeader(s) {
  var msgCount = (s.apkChatMessages || []).length;

  var header = el('div', {
    className: 'flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]',
  });

  var left = el('div', { className: 'flex items-center gap-2' });
  left.appendChild(el('span', { className: 'text-lg', html: '&#128172;' }));
  left.appendChild(el('span', { className: 'text-sm font-bold text-white' }, t('app.apk.chat.title')));
  left.appendChild(el('span', {
    className: 'text-[10px] px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/20 font-bold',
  }, t('app.apk.chat.badge')));

  if (msgCount > 0) {
    left.appendChild(el('span', {
      className: 'text-[10px] text-slate-500 ml-1',
    }, '(' + msgCount + ' messages)'));
  }

  var right = el('div', { className: 'flex items-center gap-2' });

  if (msgCount > 0) {
    right.appendChild(el('button', {
      className: 'text-[10px] px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-400/30 transition-colors',
      onClick: function() {
        if (window.confirm(t('app.apk.chat.confirmClear'))) {
          clearChatHistory().then(function() {
            showToast(t('app.apk.chat.cleared'));
            var main = document.getElementById('main-content');
            if (main) {
              import('../tab-apk-view.js').then(function(mod) {
                mod.renderApkTab(main);
              }).catch(function() {});
            }
          });
        }
      },
    }, t('app.apk.chat.clearBtn')));
  }

  header.appendChild(left);
  header.appendChild(right);
  return header;
}

function buildModelSelector(s) {
  var wrap = el('div', { className: 'mb-3' });

  var availableModels = s.availableModels || [];
  var currentModel = null;
  for (var c = 0; c < availableModels.length; c++) {
    if (availableModels[c].id === s.apkChatModelId) {
      currentModel = availableModels[c];
      break;
    }
  }
  var modelTitle = currentModel ? currentModel.title : 'DeepSeek V3.2';

  var summary = el('div', { className: 'flex items-center justify-between mb-2' });
  summary.appendChild(el('label', {
    className: 'text-[10px] font-semibold uppercase tracking-widest text-slate-500',
  }, t('app.apk.chat.selectModel')));
  summary.appendChild(el('span', {
    className: 'text-[10px] text-cyan-300',
  }, modelTitle));

  wrap.appendChild(summary);

  var dropdownWrap = el('div', { className: 'relative' });

  var searchInput = el('input', {
    type: 'text',
    className: 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50',
    placeholder: t('app.apk.chat.modelSearchPlaceholder'),
    'aria-label': t('app.apk.chat.modelSearchAria'),
    id: 'apk-chat-model-search',
  });

  var modelList = el('div', {
    className: 'rounded-lg border border-white/10 bg-slate-900/95 backdrop-blur max-h-[200px] overflow-y-auto scrollbar-hide mt-1',
    id: 'apk-chat-model-list',
  });
  modelList.style.display = 'none';

  var currentModels = availableModels;
  var currentChatModelId = s.apkChatModelId;

  function renderModelOptions(filter) {
    var q = (filter || '').toLowerCase().trim();
    var filtered;
    if (q) {
      filtered = [];
      for (var f = 0; f < currentModels.length; f++) {
        var m = currentModels[f];
        if (m.title.toLowerCase().indexOf(q) >= 0) {
          filtered.push(m);
        } else if (m.capabilitySummary && m.capabilitySummary.toLowerCase().indexOf(q) >= 0) {
          filtered.push(m);
        }
      }
    } else {
      filtered = currentModels;
    }

    modelList.innerHTML = '';

    if (filtered.length === 0) {
      modelList.appendChild(el('div', {
        className: 'px-3 py-4 text-center text-xs text-slate-500',
      }, t('app.apk.chat.noModels')));
      return;
    }

    for (var idx = 0; idx < filtered.length; idx++) {
      (function(model, index) {
        var isActive = model.id === currentChatModelId;
        var cost = model.estimatedCostPerRun || 1;

        var caps = [];
        if (model.capabilities) {
          if (model.capabilities.textInput) caps.push('text');
          if (model.capabilities.imageInput) caps.push('img-in');
          if (model.capabilities.imageOutput) caps.push('img-out');
          if (model.capabilities.audioOutput) caps.push('audio');
        }

        var rowClass = isActive
          ? 'bg-cyan-400/10 text-cyan-200'
          : 'hover:bg-white/[0.04] text-slate-300';

        var row = el('button', {
          className: 'flex items-center gap-2 w-full text-left px-3 py-2 transition-colors border-b border-white/5 last:border-b-0 ' + rowClass,
          onClick: function() {
            setState({ apkChatModelId: model.id });
            searchInput.value = '';
            modelList.style.display = 'none';
            rerenderChat();
          },
        });

        var checkClass = isActive ? 'text-cyan-300' : 'text-slate-600';
        row.appendChild(el('span', {
          className: 'text-[10px] font-bold w-4 shrink-0 ' + checkClass,
        }, isActive ? '\u2713' : String(index + 1)));

        var info = el('div', { className: 'flex-1 min-w-0' });
        info.appendChild(el('div', { className: 'text-xs font-semibold truncate' }, model.title));
        if (caps.length > 0) {
          info.appendChild(el('div', { className: 'text-[10px] text-slate-500' }, caps.join(' / ')));
        }
        row.appendChild(info);

        row.appendChild(el('span', { className: 'text-[10px] text-slate-500 shrink-0' }, '~' + cost + 'cr'));

        modelList.appendChild(row);
      })(filtered[idx], idx);
    }
  }

  searchInput.addEventListener('focus', function() {
    renderModelOptions(searchInput.value);
    modelList.style.display = 'block';
  });

  searchInput.addEventListener('input', function(e) {
    renderModelOptions(e.target.value);
    modelList.style.display = 'block';
  });

  searchInput.addEventListener('blur', function() {
    setTimeout(function() { modelList.style.display = 'none'; }, 200);
  });

  dropdownWrap.appendChild(searchInput);
  dropdownWrap.appendChild(modelList);
  wrap.appendChild(dropdownWrap);
  return wrap;
}

function buildMessagesArea(s) {
  var messages = s.apkChatMessages || [];
  var area = el('div', {
    className: 'rounded-xl bg-white/[0.02] border border-white/5 p-3 mb-3 overflow-y-auto scrollbar-hide',
    id: 'apk-chat-messages',
  });
  area.style.maxHeight = '45vh';
  area.style.minHeight = '120px';

  if (messages.length === 0) {
    area.appendChild(buildEmptyState());
    return area;
  }

  for (var i = 0; i < messages.length; i++) {
    area.appendChild(buildMessageBubble(messages[i], i));
  }

  return area;
}

function buildEmptyState() {
  var s = getState();
  var apk = s.apkFile;
  var editable = apk ? (apk.editablePaths || []) : [];

  var wrap = el('div', { className: 'text-center py-6' });
  wrap.appendChild(el('div', { className: 'text-3xl mb-3', html: '&#129302;&#128269;' }));
  wrap.appendChild(el('p', {
    className: 'text-sm text-slate-400 max-w-sm mx-auto leading-relaxed mb-3',
  }, t('app.apk.chat.welcome')));

  var pills = el('div', { className: 'flex flex-wrap justify-center gap-1.5 mt-3' });

  if (editable.length > 0) {
    pills.appendChild(el('span', {
      className: 'text-[10px] px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/20',
    }, editable.length + ' editable files'));
  }

  var cats = apk ? (apk.categories || {}) : {};
  if (cats.smali && cats.smali.length) {
    pills.appendChild(el('span', {
      className: 'text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20',
    }, cats.smali.length + ' smali files'));
  }
  if (cats.resources && cats.resources.length) {
    pills.appendChild(el('span', {
      className: 'text-[10px] px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/20',
    }, cats.resources.length + ' resources'));
  }
  if (cats.assets && cats.assets.length) {
    pills.appendChild(el('span', {
      className: 'text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20',
    }, cats.assets.length + ' assets'));
  }

  wrap.appendChild(pills);

  var sugWrap = el('div', { className: 'flex flex-wrap justify-center gap-2 mt-4' });
  var suggestions = [
    t('app.apk.chat.suggest.allPossibilities'),
    t('app.apk.chat.suggest.safeEdits'),
    t('app.apk.chat.suggest.explainStructure'),
  ];
  for (var i = 0; i < suggestions.length; i++) {
    (function(text) {
      sugWrap.appendChild(el('button', {
        className: 'text-[11px] px-3 py-2 rounded-xl border border-violet-400/20 bg-violet-400/5 text-violet-300 hover:bg-violet-400/15 transition-colors',
        onClick: function() {
          var input = document.getElementById('apk-chat-input');
          if (input) {
            input.value = text;
          }
          sendApkChatMessage(text, rerenderChat);
        },
      }, text));
    })(suggestions[i]);
  }
  wrap.appendChild(sugWrap);

  return wrap;
}

function buildMessageBubble(msg, index) {
  var isUser = msg.role === 'user';
  var justifyClass = isUser ? 'justify-end' : 'justify-start';
  var bubble = el('div', { className: 'flex ' + justifyClass + ' mb-3' });

  var bubbleClass = isUser
    ? 'bg-violet-400/15 text-violet-50 rounded-br-md border border-violet-400/10'
    : 'bg-white/[0.06] text-slate-300 rounded-bl-md border border-white/5';

  var inner = el('div', {
    className: 'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ' + bubbleClass,
  });

  if (msg.isLoading) {
    inner.innerHTML = '<span class="inline-flex gap-1"><span class="animate-bounce">.</span><span class="animate-bounce" style="animation-delay:.1s">.</span><span class="animate-bounce" style="animation-delay:.2s">.</span></span>';
  } else if (isUser) {
    inner.textContent = msg.content;
  } else {
    inner.innerHTML = renderMarkdown(msg.content);

    var actions = el('div', { className: 'flex items-center gap-2 mt-2 pt-2 border-t border-white/5' });
    actions.appendChild(el('button', {
      className: 'text-[10px] text-slate-500 hover:text-cyan-400 transition-colors',
      onClick: function() {
        navigator.clipboard.writeText(msg.content).then(function() {
          showToast(t('app.common.copied'));
        });
      },
    }, t('app.common.copyCode')));
    actions.appendChild(el('button', {
      className: 'text-[10px] text-slate-500 hover:text-amber-400 transition-colors',
      onClick: function() { retryApkChatMessage(index, rerenderChat); },
    }, t('app.apk.chat.retry')));
    inner.appendChild(actions);
  }

  if (msg.ts && !msg.isLoading) {
    var d = new Date(msg.ts);
    var time = d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    inner.appendChild(el('span', {
      className: 'block text-[9px] text-slate-600 mt-1',
    }, time));
  }

  bubble.appendChild(inner);
  return bubble;
}

function buildFollowUps(s) {
  var wrap = el('div', { className: 'mb-3' });
  wrap.appendChild(el('p', {
    className: 'text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-widest',
  }, t('app.apk.chat.followUps')));

  var pills = el('div', { className: 'flex flex-wrap gap-1.5' });
  var followUps = s.apkChatFollowUps || [];
  for (var i = 0; i < followUps.length; i++) {
    (function(text) {
      pills.appendChild(el('button', {
        className: 'text-[11px] px-3 py-1.5 rounded-xl border border-violet-400/15 bg-violet-400/[0.05] text-violet-300 hover:bg-violet-400/15 hover:border-violet-400/30 transition-colors',
        onClick: function() { sendApkChatMessage(text, rerenderChat); },
      }, text));
    })(followUps[i]);
  }
  wrap.appendChild(pills);
  return wrap;
}

function buildInputArea(s) {
  var wrap = el('div', { className: 'flex gap-2' });

  var textarea = el('textarea', {
    id: 'apk-chat-input',
    className: 'flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 resize-none',
    placeholder: t('app.apk.chat.placeholder'),
    rows: '2',
    'aria-label': t('app.apk.chat.inputAria'),
  });

  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var val = textarea.value.trim();
      if (val) {
        textarea.value = '';
        sendApkChatMessage(val, rerenderChat);
      }
    }
  });

  var sendBtnLabel = s.apkChatLoading ? t('app.apk.chat.thinking') : t('app.apk.chat.send');
  var sendBtn = el('button', {
    className: 'self-end shrink-0 rounded-xl bg-gradient-to-r from-violet-400 to-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:from-violet-300 hover:to-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm',
    disabled: s.apkChatLoading,
    onClick: function() {
      var val = textarea.value.trim();
      if (val) {
        textarea.value = '';
        sendApkChatMessage(val, rerenderChat);
      }
    },
  }, sendBtnLabel);

  wrap.appendChild(textarea);
  wrap.appendChild(sendBtn);
  return wrap;
}

function rerenderChat() {
  var panel = document.getElementById('apk-chat-panel');
  if (!panel) return;
  var parent = panel.parentElement;
  if (!parent) return;

  var newPanel = el('div');
  renderApkChatPanel(newPanel);
  var newEl = newPanel.firstElementChild;
  if (newEl) {
    parent.replaceChild(newEl, panel);
  }
}
