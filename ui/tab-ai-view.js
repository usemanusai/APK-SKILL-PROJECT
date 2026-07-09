// ui/tab-ai-view.js - AI Assistant chat tab with ALL models + search
import { getState, setState } from '../state.js';
import { el, t } from './dom.js';
import { callModel as providerCallModel, extractText as providerExtractText, getActiveProvider } from './ai-provider.js';

var DEFAULT_MODEL = '2a90c2e2-e87d-4f6a-be9a-108c25c6ad64'; // DeepSeek V3.2

export function renderAiTab(container) {
  var s = getState();
  container.innerHTML = '';

  // Model Selector with search
  var selectorWrap = el('div', { className: 'mb-4' });
  var label = el('label', { className: 'block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2' }, t('app.ai.selectModel'));

  var searchInput = el('input', {
    type: 'text',
    className: 'w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 mb-2',
    placeholder: 'Search models... (e.g. DeepSeek, GPT, Claude, Gemini)',
    'aria-label': 'Search AI models',
  });

  var modelListWrap = el('div', {
    className: 'rounded-xl border border-white/10 bg-white/[0.02] max-h-[240px] overflow-y-auto scrollbar-hide',
    id: 'model-list-wrap',
  });

  function renderModelList(filter) {
    var q = (filter || '').toLowerCase().trim();
    var models = s.availableModels;
    var filtered = [];
    if (q) {
      for (var fi = 0; fi < models.length; fi++) {
        var m = models[fi];
        var title = (m.title || '').toLowerCase();
        var caps = (m.capabilitySummary || '').toLowerCase();
        if (title.indexOf(q) >= 0 || caps.indexOf(q) >= 0) filtered.push(m);
      }
    } else {
      filtered = models;
    }

    modelListWrap.innerHTML = '';

    if (filtered.length === 0) {
      modelListWrap.appendChild(el('div', { className: 'px-4 py-6 text-center text-sm text-slate-500' }, 'No models match your search.'));
      return;
    }

    var selected = null;
    var rest = [];
    for (var r = 0; r < filtered.length; r++) {
      if (filtered[r].id === s.selectedModelId) selected = filtered[r];
      else rest.push(filtered[r]);
    }
    var ordered = selected ? [selected].concat(rest) : rest;

    for (var idx = 0; idx < ordered.length; idx++) {
      (function(m, idx) {
      var isActive = m.id === s.selectedModelId;
      var costVal = m.estimatedCostPerRun || 1;
      var costLabel = costVal <= 1 ? '~1cr' : '~' + costVal + 'cr';
      var capsArr = [];
      var mc = m.capabilities || {};
      if (mc.textInput) capsArr.push('text');
      if (mc.imageInput) capsArr.push('img-in');
      if (mc.imageOutput) capsArr.push('img-out');
      if (mc.audioInput) capsArr.push('audio-in');
      if (mc.audioOutput) capsArr.push('audio-out');
      if (mc.videoOutput) capsArr.push('video-out');

      var rowCls = 'flex items-center gap-3 w-full text-left px-4 py-2.5 transition-colors border-b border-white/5 last:border-b-0 ';
      rowCls += isActive ? 'bg-cyan-400/10 text-cyan-300' : 'hover:bg-white/[0.04] text-slate-300';

      var row = el('button', {
        className: rowCls,
        onClick: function() {
          setState({ selectedModelId: m.id });
          renderModelList(searchInput.value);
        },
      },
        el('span', { className: 'text-xs font-bold w-5 text-center shrink-0 ' + (isActive ? 'text-cyan-300' : 'text-slate-600') }, isActive ? '&#10003;' : String(idx + 1)),
        el('div', { className: 'flex-1 min-w-0' },
          el('div', { className: 'flex items-center gap-2' },
            el('span', { className: 'text-sm font-semibold truncate ' + (isActive ? 'text-cyan-200' : 'text-white') }, m.title),
            isActive ? el('span', { className: 'text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-400/20 text-cyan-300 font-bold' }, 'SELECTED') : null,
          ),
          el('div', { className: 'flex items-center gap-2 mt-0.5' },
            el('span', { className: 'text-xs text-slate-500' }, capsArr.join(' / ')),
            m.capabilitySummary ? el('span', { className: 'text-xs text-slate-600 hidden sm:inline' }, '(' + m.capabilitySummary + ')') : null,
          ),
        ),
        el('span', { className: 'text-xs text-slate-500 shrink-0 tabular-nums' }, costLabel),
      );
      modelListWrap.appendChild(row);
      })(ordered[idx], idx);
    }
  }

  renderModelList();

  searchInput.addEventListener('input', function(e) { renderModelList(e.target.value); });

  var currentModel = null;
  for (var cm = 0; cm < s.availableModels.length; cm++) {
    if (s.availableModels[cm].id === s.selectedModelId) { currentModel = s.availableModels[cm]; break; }
  }
  var providerIsOpenRouter = getActiveProvider() === 'openrouter';
  var summaryEl = el('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
    el('span', { className: 'text-xs text-slate-500' }, 'Using:'),
    el('span', { className: 'text-xs font-semibold text-cyan-300' }, currentModel ? currentModel.title : 'DeepSeek V3.2'),
    el('span', { className: 'text-xs text-slate-600' }, '(' + ((currentModel && currentModel.estimatedCostPerRun) || 5) + ' credits/run)'),
    providerIsOpenRouter ? el('span', { className: 'text-[10px] px-1.5 py-0.5 rounded-md bg-violet-400/15 text-violet-300 font-bold border border-violet-400/30' }, 'OPENROUTER') : null,
  );

  selectorWrap.appendChild(label);
  selectorWrap.appendChild(searchInput);
  selectorWrap.appendChild(modelListWrap);
  selectorWrap.appendChild(summaryEl);
  container.appendChild(selectorWrap);

  // Chat area
  var chatArea = el('div', { className: 'chat-area rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4 overflow-y-auto', id: 'chat-area', style: 'max-height: 40vh; min-height: 160px;' });

  if (s.chatMessages.length === 0) {
    chatArea.appendChild(createWelcome());
  } else {
    for (var mi = 0; mi < s.chatMessages.length; mi++) {
      chatArea.appendChild(createMessageBubble(s.chatMessages[mi]));
    }
  }
  container.appendChild(chatArea);

  // Suggestions (only when empty)
  if (s.chatMessages.length === 0) {
    var sugWrap = el('div', { className: 'flex flex-wrap gap-2 mb-4' });
    var suggestions = [
      t('app.ai.suggestions.decompile'),
      t('app.ai.suggestions.smali'),
      t('app.ai.suggestions.rebuild'),
      t('app.ai.suggestions.tools'),
    ];
    for (var si = 0; si < suggestions.length; si++) {
      (function(text) {
      sugWrap.appendChild(el('button', {
        className: 'text-xs px-3 py-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 hover:bg-cyan-400/15 transition-colors',
        onClick: function() { sendChat(text, container); },
      }, text));
      })(suggestions[si]);
    }
    container.appendChild(sugWrap);
  }

  // Input area
  var inputWrap = el('div', { className: 'flex gap-2' });
  var textarea = el('textarea', {
    id: 'chat-input',
    className: 'flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 resize-none',
    placeholder: t('app.ai.placeholder'),
    rows: '2',
  });

  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(textarea.value, container);
    }
  });

  var sendBtn = el('button', {
    id: 'chat-send',
    className: 'self-end rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm',
    onClick: function() { sendChat(textarea.value, container); },
  }, t('app.ai.send'));

  inputWrap.appendChild(textarea);
  inputWrap.appendChild(sendBtn);
  container.appendChild(inputWrap);

  // Clear chat button
  if (s.chatMessages.length > 0) {
    container.appendChild(el('div', { className: 'flex justify-center mt-3' },
      el('button', {
        className: 'text-xs text-slate-500 hover:text-rose-400 transition-colors',
        onClick: function() {
          setState({ chatMessages: [] });
          renderAiTab(container);
        },
      }, 'Clear conversation'),
    ));
  }

  requestAnimationFrame(function() {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function createWelcome() {
  var wrap = el('div', { className: 'text-center py-8' });
  var icon = el('div', { className: 'text-4xl mb-3', html: '&#129302;' });
  var msg = el('p', { className: 'text-sm text-slate-400 max-w-md mx-auto leading-relaxed' }, t('app.ai.welcome'));
  wrap.appendChild(icon);
  wrap.appendChild(msg);
  return wrap;
}

function createMessageBubble(msg) {
  var isUser = msg.role === 'user';
  var bubble = el('div', { className: 'flex ' + (isUser ? 'justify-end' : 'justify-start') + ' mb-3' });
  var inner = el('div', {
    className: 'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ' +
      (isUser
        ? 'bg-cyan-400/20 text-cyan-50 rounded-br-md'
        : 'bg-white/[0.06] text-slate-300 rounded-bl-md'),
  });

  if (msg.isLoading) {
    inner.innerHTML = '<span class="inline-flex gap-1"><span class="animate-bounce">.</span><span class="animate-bounce" style="animation-delay:.1s">.</span><span class="animate-bounce" style="animation-delay:.2s">.</span></span>';
  } else {
    inner.textContent = msg.content;
  }

  bubble.appendChild(inner);
  return bubble;
}

function sendChat(text, container) {
  text = text.trim();
  if (!text || getState().isLoading) return;

  var messages = getState().chatMessages.concat([{ role: 'user', content: text }]);
  setState({ chatMessages: messages, isLoading: true });

  messages = messages.concat([{ role: 'assistant', content: '', isLoading: true }]);
  setState({ chatMessages: messages });

  if (container) renderAiTab(container);

  var modelId = getState().selectedModelId;
  var systemMsg = 'You are an expert Android development assistant. You help users understand APK structure, decompiling, modifying resources, rebuilding, and signing APK files. You cover client-side editing (resources, smali, manifest), server-side techniques (API interception, Frida), and common development workflows. Give clear, practical answers with command examples when helpful. Be concise but thorough. Format code blocks with triple backticks.';

  var cleanMessages = getState().chatMessages.filter(function(m) { return !m.isLoading; });
  var apiMessages = [{ role: 'system', content: systemMsg }];
  for (var ai = 0; ai < cleanMessages.length; ai++) {
    apiMessages.push({ role: cleanMessages[ai].role, content: cleanMessages[ai].content });
  }

  var maxAttempts = 2;

  function attempt(attemptNum) {
    var timeoutMs = attemptNum === 1 ? 120000 : 180000;
    return providerCallModel({
      modelId: modelId,
      messages: apiMessages,
      timeoutMs: timeoutMs,
    }).then(function(result) {
      var reply = providerExtractText(result) || '';
      if (reply.trim().length > 0) return reply;
      throw new Error('Empty response');
    }).catch(function(err) {
      if (attemptNum < maxAttempts) {
        console.warn('Chat attempt ' + attemptNum + '/' + maxAttempts + ' failed: ' + err.message);
        var retryMsgs = getState().chatMessages.filter(function(m) { return !m.isLoading; });
        retryMsgs.push({ role: 'assistant', content: '', isLoading: true, loadingText: 'Retrying (attempt ' + (attemptNum + 1) + ')...' });
        setState({ chatMessages: retryMsgs });
        if (container) renderAiTab(container);
        return new Promise(function(resolve) { setTimeout(resolve, 2000); }).then(function() {
          return attempt(attemptNum + 1);
        });
      }
      throw err;
    });
  }

  attempt(1).then(function(reply) {
    var all = getState().chatMessages.filter(function(m) { return !m.isLoading; });
    all.push({ role: 'assistant', content: reply });
    setState({ chatMessages: all, isLoading: false });
    var finalEl = document.getElementById('main-content');
    if (finalEl) renderAiTab(finalEl);
  }).catch(function(err) {
    console.error('AI error:', err);
    var errMsg = (err.message || '').toLowerCase();
    var reply;
    if (errMsg.indexOf('timeout') >= 0 || errMsg.indexOf('timed out') >= 0) {
      reply = 'Request timed out after 2 attempts. The model may be busy \u2014 try a faster model (like DeepSeek V4 Flash) or ask a shorter question.';
    } else if (errMsg.indexOf('credit') >= 0 || errMsg.indexOf('quota') >= 0) {
      reply = 'Not enough credits or rate limited. Try a cheaper model or wait a moment.';
    } else {
      reply = err.message || t('app.ai.error');
    }
    var all = getState().chatMessages.filter(function(m) { return !m.isLoading; });
    all.push({ role: 'assistant', content: reply });
    setState({ chatMessages: all, isLoading: false });
    var finalEl = document.getElementById('main-content');
    if (finalEl) renderAiTab(finalEl);
  });
}
