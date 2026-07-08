// ui/tab-editor-view.js - Interactive file editor with AI analysis + static mods
import { getState, setState } from '../state.js';
import { el, t, showToast } from './dom.js';
import { FILE_TYPES, computeDiff, CATEGORY_NAMES, getTotalModCount } from './editor-transformers.js';
import { analyzeAndSuggestMods, AI_CATEGORIES } from './ai-analysis.js';

var history = [];
var historyIndex = -1;

function pushHistory(content) {
  history = history.slice(0, historyIndex + 1);
  history.push(content);
  historyIndex = history.length - 1;
}

export function renderEditorTab(container) {
  var s = getState();
  var ftKey = s.editorFileType || 'manifest';
  var ft = FILE_TYPES[ftKey];

  container.innerHTML = '';

  // Header
  container.appendChild(el('div', { className: 'mb-4' },
    el('h2', { className: 'text-lg font-bold text-white' }, t('app.editor.title')),
    el('p', { className: 'text-xs text-slate-400 mt-1' }, t('app.editor.subtitle')),
    el('p', { className: 'text-xs text-cyan-400/70 mt-1' },
      getTotalModCount() + ' static modifications across 4 file types \u00b7 AI-powered custom modifications'
    )
  ));

  // File Type Selector
  var fileSelectorWrap = el('div', { className: 'mb-4' });
  var fileLabel = el('label', { className: 'block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2' }, t('app.editor.fileType'));
  var fileBtns = el('div', { className: 'flex flex-wrap gap-2' });

  var ftKeys = Object.keys(FILE_TYPES);
  for (var fi = 0; fi < ftKeys.length; fi++) {
    (function(f) {
    var isActive = f.key === ftKey;
    var modCount = f.transforms.length;
    fileBtns.appendChild(el('button', {
      className: 'px-3 py-2 rounded-xl text-xs font-semibold transition-all border ' +
        (isActive
          ? 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30'
          : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'),
      onClick: function() {
        setState({
          editorFileType: f.key, editorContent: '', editorAppliedMods: [],
          editorShowDiff: false, aiMods: [], aiError: null,
        });
        history = [];
        historyIndex = -1;
        renderEditorTab(container);
      }
    }, f.label + ' (' + modCount + ')'));
    })(FILE_TYPES[ftKeys[fi]]);
  }

  fileSelectorWrap.appendChild(fileLabel);
  fileSelectorWrap.appendChild(fileBtns);
  container.appendChild(fileSelectorWrap);

  // Content Input
  var contentLabel = el('div', { className: 'flex items-center justify-between mb-2' },
    el('label', { className: 'block text-xs font-semibold uppercase tracking-widest text-slate-500' }, t('app.editor.pasteContent')),
    el('button', {
      className: 'text-xs text-cyan-400 hover:text-cyan-300 transition-colors',
      onClick: function() {
        setState({ editorContent: ft.placeholder, aiMods: [], aiError: null });
        if (history.length === 0) pushHistory(ft.placeholder);
        renderEditorTab(container);
      }
    }, t('app.editor.loadExample'))
  );
  container.appendChild(contentLabel);

  var textarea = el('textarea', {
    className: 'w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-cyan-100 font-mono editor-textarea placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition resize-y',
    style: 'min-height: 140px; max-height: 350px;',
    placeholder: 'Paste any Android file \u2014 smali, manifest, strings, colors, or any code...',
    rows: '6',
    'aria-label': t('app.editor.pasteContent'),
  });
  textarea.value = s.editorContent || '';
  textarea.addEventListener('input', function(e) {
    var val = e.target.value;
    setState({ editorContent: val });
    pushHistory(val);
    updateUndoRedoButtons();
  });
  container.appendChild(textarea);

  // Undo / Redo Bar
  var undoRedoBar = el('div', { className: 'flex gap-2 mt-2 mb-4' });

  var undoBtn = el('button', {
    className: 'px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all',
    onClick: function() {
      if (historyIndex > 0) {
        historyIndex--;
        setState({ editorContent: history[historyIndex] });
        renderEditorTab(container);
        showToast(t('app.editor.undo'));
      }
    }
  }, '\u21a9 ' + t('app.editor.undo'));

  var redoBtn = el('button', {
    className: 'px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all',
    onClick: function() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        setState({ editorContent: history[historyIndex] });
        renderEditorTab(container);
        showToast(t('app.editor.redo'));
      }
    }
  }, t('app.editor.redo') + ' \u21aa');

  function updateUndoRedoButtons() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
  }

  var historyInfo = el('span', { className: 'text-xs text-slate-500 self-center ml-auto', id: 'history-info' });
  undoRedoBar.appendChild(undoBtn);
  undoRedoBar.appendChild(redoBtn);
  undoRedoBar.appendChild(historyInfo);
  container.appendChild(undoRedoBar);

  // Content too short? Show empty state
  var content = s.editorContent || '';
  if (content.trim().length < 10) {
    container.appendChild(el('div', { className: 'text-center py-8 rounded-2xl border border-dashed border-white/10' },
      el('div', { className: 'text-3xl mb-2', html: '&#128295;' }),
      el('p', { className: 'text-sm text-slate-500' }, t('app.editor.noContent')),
      el('p', { className: 'text-xs text-slate-600 mt-1' }, 'Paste any Android file and hit "AI Analyze" for custom modifications')
    ));
    updateUndoRedoButtons();
    updateHistoryInfo();
    return;
  }

  // AI ANALYSIS SECTION
  renderAiSection(container, ftKey);

  // STATIC MODS (grouped by category)
  var modsHeader = el('div', { className: 'flex items-center justify-between mb-3 mt-2' },
    el('h3', { className: 'text-sm font-semibold text-white' },
      el('span', { html: '&#128295; ' }),
      t('app.editor.availableMods') + ' (' + ft.transforms.length + ' built-in)'
    ),
    el('span', { className: 'text-xs text-slate-500' }, t('app.editor.clickToApply'))
  );
  container.appendChild(modsHeader);

  // Group transforms by category
  var grouped = {};
  for (var ti = 0; ti < ft.transforms.length; ti++) {
    var tx = ft.transforms[ti];
    var cat = tx.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tx);
  }

  var groupedKeys = Object.keys(grouped);
  for (var gi = 0; gi < groupedKeys.length; gi++) {
    (function(catId, txs) {
    var catName = CATEGORY_NAMES[catId] || catId;
    var catHeader = el('div', { className: 'flex items-center gap-2 mt-3 mb-2' },
      el('div', { className: 'h-px flex-1 bg-white/10' }),
      el('span', { className: 'text-xs font-semibold uppercase tracking-widest text-slate-500 px-2' }, catName),
      el('div', { className: 'h-px flex-1 bg-white/10' })
    );
    container.appendChild(catHeader);

    var modsGrid = el('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3' });

    for (var mj = 0; mj < txs.length; mj++) {
      var isApplicable = txs[mj].detect(content);
      var isApplied = (s.editorAppliedMods || []).indexOf(txs[mj].id) >= 0;
      modsGrid.appendChild(createModCard(txs[mj], content, isApplicable, isApplied, container, false));
    }

    container.appendChild(modsGrid);
    })(groupedKeys[gi], grouped[groupedKeys[gi]]);
  }

  // Diff View
  if (s.editorShowDiff && s.editorLastContent) {
    renderDiffView(container, s, ft);
  }

  updateUndoRedoButtons();
  updateHistoryInfo();

  function updateHistoryInfo() {
    var infoEl = container.querySelector('#history-info');
    if (infoEl) {
      infoEl.textContent = (historyIndex + 1) + ' / ' + history.length + ' ' + t('app.editor.historySteps');
    }
  }
}

// AI Analysis Section
function renderAiSection(container, ftKey) {
  var s = getState();

  var aiSection = el('div', { className: 'mb-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.04] to-violet-400/[0.04] p-4' });

  // Header
  aiSection.appendChild(el('div', { className: 'flex items-center justify-between mb-3' },
    el('div', {},
      el('h3', { className: 'text-sm font-bold text-white flex items-center gap-2' },
        el('span', { html: '&#129504;' }),
        'AI-Powered Modification Generator'
      ),
      el('p', { className: 'text-xs text-slate-400 mt-0.5' }, 'Send your file to AI \u2014 discover relevant modifications')
    ),
    el('span', {
      className: 'text-[10px] px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 font-bold border border-violet-400/20',
    }, 'AI-POWERED')
  ));

  // Model selector for AI analysis
  var modelRow = el('div', { className: 'flex items-center gap-2 mb-3' });
  var modelSelect = el('select', {
    className: 'flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 appearance-none cursor-pointer',
    'aria-label': 'AI model for analysis',
  });

  var models = s.availableModels || [];
  for (var mi = 0; mi < models.length; mi++) {
    var m = models[mi];
    var opt = el('option', { value: m.id });
    var cost = m.estimatedCostPerRun || 1;
    opt.textContent = m.title + ' (~' + cost + 'cr)';
    opt.selected = m.id === (s.aiModelId || s.selectedModelId);
    modelSelect.appendChild(opt);
  }

  modelSelect.addEventListener('change', function(e) {
    setState({ aiModelId: e.target.value });
  });

  var analyzeBtn = el('button', {
    className: 'shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 text-slate-950 font-bold text-xs transition hover:from-cyan-300 hover:to-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2',
    id: 'ai-analyze-btn',
    onClick: function() { runAiAnalysis(container, ftKey); },
  },
    el('span', { html: '&#9889;' }),
    'AI Analyze'
  );

  modelRow.appendChild(modelSelect);
  modelRow.appendChild(analyzeBtn);
  aiSection.appendChild(modelRow);

  // Loading state
  if (s.aiAnalyzing) {
    var loadingWrap = el('div', { className: 'flex flex-col items-center gap-2 py-4' });
    loadingWrap.appendChild(el('div', { className: 'flex gap-1' },
      el('span', { className: 'animate-bounce text-lg', html: '&#128270;' })
    ));
    loadingWrap.appendChild(el('div', {
      className: 'text-sm text-cyan-300 animate-pulse',
      id: 'ai-progress-text',
    }, s.aiProgressMsg || 'Analyzing file and generating custom mods...'));
    if (s.aiAttempt) {
      var dotsRow = el('div', { className: 'flex items-center gap-2 mt-1' });
      for (var di = 0; di < (s.aiMaxAttempts || 3); di++) {
        var dotClass = di < (s.aiAttempt || 0) - 1 ? 'bg-cyan-400' :
          di === (s.aiAttempt || 0) - 1 ? 'bg-cyan-400 animate-pulse' : 'bg-white/10';
        dotsRow.appendChild(el('span', { className: 'w-2.5 h-2.5 rounded-full ' + dotClass }));
      }
      dotsRow.appendChild(el('span', { className: 'text-xs text-slate-500' },
        'Attempt ' + s.aiAttempt + '/' + (s.aiMaxAttempts || 3)
      ));
      loadingWrap.appendChild(dotsRow);
    }
    aiSection.appendChild(loadingWrap);
  }

  // Error state
  if (s.aiError) {
    aiSection.appendChild(el('div', { className: 'rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 mt-2' },
      el('div', { className: 'flex items-center gap-2' },
        el('span', { className: 'text-sm' }, '&#9888;&#65039;'),
        el('span', { className: 'text-sm text-rose-300' }, s.aiError),
      ),
      el('button', {
        className: 'mt-2 text-xs text-rose-400 hover:text-rose-300 underline',
        onClick: function() { setState({ aiError: null }); },
      }, 'Dismiss')
    ));
  }

  // AI-generated mods count
  if (s.aiMods && s.aiMods.length > 0) {
    aiSection.appendChild(el('div', { className: 'text-xs text-emerald-400 font-semibold mt-1' },
      '&#10003; ' + s.aiMods.length + ' custom mods generated \u2014 scroll down to apply them'
    ));
  }

  container.appendChild(aiSection);

  // Render AI mods if available
  if (s.aiMods && s.aiMods.length > 0) {
    renderAiModsGrid(container, s);
  }
}

function renderAiModsGrid(container, s) {
  var header = el('div', { className: 'flex items-center gap-2 mt-4 mb-3' },
    el('div', { className: 'h-px flex-1 bg-violet-400/20' }),
    el('span', { className: 'text-xs font-bold uppercase tracking-widest text-violet-300 px-2 flex items-center gap-1.5' },
      el('span', { html: '&#129504;' }),
      'AI-Generated Mods (' + s.aiMods.length + ')'
    ),
    el('div', { className: 'h-px flex-1 bg-violet-400/20' }),
  );
  container.appendChild(header);

  // Group AI mods by category
  var aiGrouped = {};
  for (var ai = 0; ai < s.aiMods.length; ai++) {
    var mod = s.aiMods[ai];
    var cat = mod.category || 'features';
    if (!aiGrouped[cat]) aiGrouped[cat] = [];
    aiGrouped[cat].push(mod);
  }

  var aiKeys = Object.keys(aiGrouped);
  for (var ak = 0; ak < aiKeys.length; ak++) {
    (function(catId, mods) {
    var catInfo = AI_CATEGORIES[catId] || AI_CATEGORIES.features;

    var catHeader = el('div', { className: 'flex items-center gap-2 mt-2 mb-2' },
      el('span', { className: 'text-sm', html: catInfo.icon }),
      el('span', { className: 'text-xs font-semibold uppercase tracking-widest text-slate-400' }, catInfo.name),
      el('span', { className: 'text-xs text-slate-600' }, '(' + mods.length + ')'),
    );
    container.appendChild(catHeader);

    var grid = el('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2' });

    for (var mi = 0; mi < mods.length; mi++) {
      (function(mod) {
      var isApplied = (s.editorAppliedMods || []).indexOf(mod.id) >= 0;

      var card = el('div', {
        className: 'rounded-xl border p-3 transition-all ' +
          (isApplied
            ? 'bg-emerald-500/10 border-emerald-500/30 mod-card-applied'
            : 'bg-violet-400/[0.04] border-violet-400/20 hover:border-violet-400/40 hover:bg-violet-400/[0.08] cursor-pointer'),
      });

      var topRow = el('div', { className: 'flex items-center gap-2' });
      topRow.appendChild(el('span', {
        className: 'text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0 ' +
          (isApplied ? 'bg-emerald-400 text-slate-950' : 'bg-violet-400/20 text-violet-300'),
        html: isApplied ? '&#10003;' : '&#129504;',
      }));
      topRow.appendChild(el('span', { className: 'text-sm font-semibold text-white flex-1 leading-tight' }, mod.label));
      card.appendChild(topRow);

      card.appendChild(el('p', { className: 'text-xs text-slate-400 mt-1 ml-7 leading-relaxed' }, mod.description));

      if (!isApplied) {
        card.addEventListener('click', function() {
          setState({
            editorContent: mod.modifiedContent,
            editorAppliedMods: (s.editorAppliedMods || []).concat([mod.id]),
            editorShowDiff: true,
          });
          pushHistory(mod.modifiedContent);
          renderEditorTab(container);
          showToast('AI mod applied: ' + mod.label);
        });
      }

      grid.appendChild(card);
      })(mods[mi]);
    }

    container.appendChild(grid);
    })(aiKeys[ak], aiGrouped[aiKeys[ak]]);
  }
}

// AI Analysis Runner
function runAiAnalysis(container, ftKey) {
  var s = getState();
  var content = s.editorContent || '';

  if (content.trim().length < 20) {
    showToast('Paste more content before analyzing');
    return;
  }

  var modelId = s.aiModelId || s.selectedModelId;

  setState({
    aiAnalyzing: true, aiError: null, aiMods: [],
    aiAttempt: 1, aiMaxAttempts: 3, aiProgressMsg: 'Connecting to AI model...',
  });
  renderEditorTab(container);

  analyzeAndSuggestMods(content, ftKey, modelId, function(progress) {
    setState({
      aiAttempt: progress.attempt,
      aiMaxAttempts: progress.maxAttempts,
      aiProgressMsg: progress.message,
    });
    var statusEl = container.querySelector('#ai-progress-text');
    if (statusEl) statusEl.textContent = progress.message;
  }).then(function(mods) {
    setState({ aiAnalyzing: false, aiMods: mods, aiError: null });

    if (mods.length === 0) {
      setState({
        aiError: 'AI analyzed the file but found no applicable mods. Try pasting a different file type or selecting another model.',
      });
    } else {
      showToast(mods.length + ' AI mods generated!');
    }
    renderEditorTab(container);
  }).catch(function(err) {
    console.error('AI analysis error:', err);

    var errMsg = (err.message || '').toLowerCase();
    var userMsg;

    if (errMsg.indexOf('timeout') >= 0 || errMsg.indexOf('timed out') >= 0) {
      userMsg = 'All 3 attempts timed out. The model may be overloaded \u2014 try a faster model (DeepSeek V4 Flash) or paste shorter file content.';
    } else if (errMsg.indexOf('json') >= 0 || errMsg.indexOf('parse') >= 0 || errMsg.indexOf('invalid') >= 0) {
      userMsg = 'The AI returned an unreadable format after 3 attempts. Try a different model or shorter content.';
    } else if (errMsg.indexOf('empty') >= 0) {
      userMsg = 'The AI returned empty responses. Try a different model.';
    } else if (errMsg.indexOf('credit') >= 0 || errMsg.indexOf('quota') >= 0 || errMsg.indexOf('limit') >= 0) {
      userMsg = 'Not enough credits or rate limited. Try a cheaper model or wait a moment.';
    } else if (errMsg.indexOf('sign') >= 0 || errMsg.indexOf('auth') >= 0) {
      userMsg = 'Sign in required to use AI. Please sign in and try again.';
    } else {
      userMsg = 'Analysis failed after 3 attempts: ' + (err.message || 'Unknown error') + '. Try a different model.';
    }

    setState({ aiAnalyzing: false, aiError: userMsg });
    renderEditorTab(container);
  });
}

// Reusable mod card renderer
function createModCard(tx, content, isApplicable, isApplied, container, isAi) {
  var card = el('div', {
    className: 'rounded-xl border p-3 transition-all ' +
      (isApplied
        ? 'bg-emerald-500/10 border-emerald-500/30 mod-card-applied'
        : isApplicable
          ? 'bg-white/[0.03] border-white/10 hover:border-cyan-400/40 hover:bg-cyan-400/5 cursor-pointer mod-card-available'
          : 'bg-white/[0.01] border-white/5 opacity-30 cursor-not-allowed')
  });

  var topRow = el('div', { className: 'flex items-center gap-2' });
  topRow.appendChild(el('span', {
    className: 'text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0 ' +
      (isApplied ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-400'),
    html: isApplied ? '&#10003;' : '&rarr;'
  }));
  topRow.appendChild(el('span', { className: 'text-sm font-semibold text-white flex-1 leading-tight' }, tx.label));
  card.appendChild(topRow);

  card.appendChild(el('p', { className: 'text-xs text-slate-400 mt-1 ml-7 leading-relaxed' }, tx.description));

  // Input fields for mods that need them
  var inputEl = null;
  if (tx.hasInput) {
    inputEl = el('input', {
      type: 'text',
      className: 'mt-2 ml-7 w-full max-w-[200px] rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50',
      placeholder: tx.inputPlaceholder || '',
      'aria-label': tx.label + ' value',
      value: (getState().editorModInputs && getState().editorModInputs[tx.id]) || '',
    });
    inputEl.addEventListener('input', function(e) {
      var inputs = {};
      var existing = getState().editorModInputs || {};
      var keys = Object.keys(existing);
      for (var ik = 0; ik < keys.length; ik++) inputs[keys[ik]] = existing[keys[ik]];
      inputs[tx.id] = e.target.value;
      setState({ editorModInputs: inputs });
    });
    card.appendChild(inputEl);
  }

  if (tx.hasColor) {
    inputEl = el('input', {
      type: 'color',
      className: 'mt-2 ml-7 w-12 h-8 rounded-lg bg-transparent border border-white/10 cursor-pointer',
      value: tx.colorDefault || '#00FF88',
      'aria-label': tx.label + ' color',
    });
    inputEl.addEventListener('input', function(e) {
      var inputs = {};
      var existing = getState().editorModInputs || {};
      var keys = Object.keys(existing);
      for (var ik = 0; ik < keys.length; ik++) inputs[keys[ik]] = existing[keys[ik]];
      inputs[tx.id] = e.target.value;
      setState({ editorModInputs: inputs });
    });
    card.appendChild(inputEl);
  }

  if (isApplicable) {
    card.addEventListener('click', function(e) {
      if (e.target.tagName === 'INPUT') return;
      var val = (getState().editorModInputs || {})[tx.id] || '';
      var result = tx.apply(content, val);
      setState({
        editorContent: result,
        editorAppliedMods: (getState().editorAppliedMods || []).concat([tx.id]),
        editorShowDiff: true,
      });
      pushHistory(result);
      renderEditorTab(container);
      showToast(t('app.editor.modApplied', { name: tx.label }));
    });
  }

  return card;
}

// Diff View
function renderDiffView(container, s, ft) {
  var diffHeader = el('div', { className: 'flex items-center justify-between mb-3 mt-4' },
    el('h3', { className: 'text-sm font-semibold text-white' }, t('app.editor.diffView')),
    el('div', { className: 'flex gap-2' },
      el('button', {
        className: 'text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors',
        onClick: function() {
          navigator.clipboard.writeText(s.editorContent).then(function() { showToast(t('app.common.copied')); });
        }
      }, t('app.editor.copyResult')),
      el('button', {
        className: 'text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors',
        onClick: function() {
          var a = document.createElement('a');
          var blob = new Blob([s.editorContent], { type: 'text/plain' });
          a.href = URL.createObjectURL(blob);
          a.download = ft.label.replace(/\//g, '_');
          a.click();
          URL.revokeObjectURL(a.href);
        }
      }, t('app.editor.download'))
    )
  );
  container.appendChild(diffHeader);

  var diff = computeDiff(s.editorLastContent, s.editorContent);
  var diffContainer = el('div', { className: 'rounded-xl border border-white/10 overflow-hidden mb-4' });

  var added = 0, removed = 0;
  for (var dc = 0; dc < diff.length; dc++) {
    if (diff[dc].type === 'added') added++;
    if (diff[dc].type === 'removed') removed++;
  }
  var statsBar = el('div', { className: 'flex gap-3 px-4 py-2 bg-white/[0.03] border-b border-white/10 text-xs' },
    el('span', { className: 'text-emerald-400 font-semibold' }, '+' + added + ' added'),
    el('span', { className: 'text-rose-400 font-semibold' }, '-' + removed + ' removed'),
  );
  diffContainer.appendChild(statsBar);

  var diffBody = el('div', { className: 'overflow-x-auto max-h-[300px] overflow-y-auto font-mono text-xs' });

  for (var di = 0; di < diff.length; di++) {
    var part = diff[di];
    var line = el('div', { className: 'flex border-b border-white/5' });
    var lineNum = el('div', { className: 'shrink-0 w-10 text-right pr-2 py-1 text-slate-600 select-none' });
    var contentEl = el('div', { className: 'flex-1 py-1 px-2 whitespace-pre' });

    if (part.type === 'added') {
      line.classList.add('diff-line-added');
      lineNum.textContent = part.newLine || '';
      contentEl.textContent = part.text;
      contentEl.classList.add('text-emerald-300');
    } else if (part.type === 'removed') {
      line.classList.add('diff-line-removed');
      lineNum.textContent = part.oldLine || '';
      contentEl.textContent = part.text;
      contentEl.classList.add('text-rose-300');
    } else {
      lineNum.textContent = part.oldLine || '';
      contentEl.textContent = part.text;
      contentEl.classList.add('text-slate-400');
    }

    line.appendChild(lineNum);
    line.appendChild(contentEl);
    diffBody.appendChild(line);
  }

  diffContainer.appendChild(diffBody);
  container.appendChild(diffContainer);
}
