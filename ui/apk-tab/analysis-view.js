import { getState, setState } from '../../state.js';
import { el, t } from '../dom.js';

export function renderAnalysisSection(container, onRunAnalysis) {
  var s = getState();
  var apk = s.apkFile;
  var wrap = el('div', { className: 'mb-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.04] to-violet-400/[0.04] p-4' });

  wrap.appendChild(el('div', { className: 'flex items-center justify-between mb-3' },
    el('div', {},
      el('h3', { className: 'text-sm font-bold text-white flex items-center gap-2' },
        el('span', { html: '&#129504;' }),
        t('app.apk.analysisTitle')
      ),
      el('p', { className: 'text-xs text-slate-400 mt-0.5' }, t('app.apk.analyzeDesc')),
    ),
    el('span', { className: 'text-[10px] px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 font-bold border border-violet-400/20' }, t('app.apk.auto'))
  ));

  if (!(apk.editablePaths || []).length) {
    wrap.appendChild(el('div', { className: 'mb-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2' },
      el('p', { className: 'text-xs text-amber-100/90 leading-relaxed' }, t('app.apk.noEditable')),
    ));
  }

  var modelRow = el('div', { className: 'flex items-center gap-2 mb-3' });
  var modelSelect = el('select', {
    className: 'flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 appearance-none cursor-pointer',
    'aria-label': t('app.apk.analysisModelAria'),
  });

  var models = s.availableModels || [];
  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    var option = el('option', { value: model.id });
    option.textContent = model.title + ' (~' + (model.estimatedCostPerRun || 1) + 'cr)';
    option.selected = model.id === (s.aiModelId || s.selectedModelId);
    modelSelect.appendChild(option);
  }

  modelSelect.addEventListener('change', function(event) { setState({ aiModelId: event.target.value }); });
  modelRow.appendChild(modelSelect);
  modelRow.appendChild(el('button', {
    id: 'apk-analyze-btn',
    className: 'shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 text-slate-950 font-bold text-xs transition hover:from-cyan-300 hover:to-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2',
    onClick: onRunAnalysis,
    disabled: s.apkState === 'analyzing' || !(apk.editablePaths || []).length,
    'aria-label': s.apkState === 'analyzing' ? t('app.apk.analyzingShort') : t('app.apk.analyze'),
  },
    el('span', { html: '&#9889;' }),
    s.apkState === 'analyzing' ? t('app.apk.analyzingShort') : t('app.apk.analyze'),
  ));
  wrap.appendChild(modelRow);

  if (s.apkState === 'analyzing' || s.apkState === 'skillmd-generating') {
    renderSquadProgress(wrap, s);
  }

  // Show existing mods count banner during re-analysis
  if (s.apkState === 'analyzing' && (s.apkMods || []).length > 0) {
    wrap.appendChild(el('div', { className: 'mt-2 rounded-xl bg-cyan-400/5 border border-cyan-400/20 px-3 py-2' },
      el('p', { className: 'text-xs text-cyan-300' },
        (s.apkMods.length) + ' existing modification(s) preserved — new mods will be merged on completion.',
      ),
    ));
  }

  if ((s.apkState === 'loaded' || s.apkState === 'complete') && s.apkAnalysisError) {
    wrap.appendChild(el('div', { className: 'rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 mt-2' },
      el('div', { className: 'flex items-center gap-2' },
        el('span', { className: 'text-sm' }, '&#9888;&#65039;'),
        el('span', { className: 'text-sm text-rose-300' }, s.apkAnalysisError),
      ),
      el('button', {
        className: 'mt-2 text-xs text-rose-400 hover:text-rose-300 underline',
        onClick: function() { setState({ apkAnalysisError: null }); },
      }, t('app.editor.aiDismiss')),
    ));
  }

  container.appendChild(wrap);
}

function renderSquadProgress(container, state) {
  var progress = el('div', { className: 'flex flex-col items-center gap-3 py-4' });

  // Animated icon
  progress.appendChild(el('div', { className: 'flex gap-1' },
    el('span', { className: 'animate-bounce text-lg', html: '&#129504;' }),
  ));

  // Progress message (live updated by workflow)
  progress.appendChild(el('div', {
    className: 'text-sm text-cyan-300 animate-pulse text-center',
    id: 'apk-progress-text',
  }, state.apkProgressMsg || t('app.apk.progressStarting')));

  // Squad phase indicators — adapt for SKILL.md generation vs normal analysis
  var phases;
  var isSkillMd = state.apkState === 'skillmd-generating';

  if (isSkillMd) {
    phases = [
      { label: 'Recon', icon: '&#128269;', step: 1 },
      { label: 'Android/APK MCP', icon: '&#129302;', step: 2 },
      { label: 'Per-Mod Writers', icon: '&#128221;', step: 3 },
      { label: 'Assembler', icon: '&#9989;', step: 4 },
    ];
  } else {
    phases = [
      { label: 'Recon', icon: '&#128269;', step: 1 },
      { label: 'Specialists', icon: '&#9881;', step: 2 },
      { label: 'Validate', icon: '&#9989;', step: 3 },
    ];
  }

  // Determine which phase we're in based on the progress message
  var currentPhase = 0;
  var progressMsg = (state.apkProgressMsg || '').toLowerCase();
  var isSkillMd = state.apkState === 'skillmd-generating';

  if (isSkillMd) {
    if (progressMsg.indexOf('init') >= 0 || progressMsg.indexOf('starting') >= 0) currentPhase = 1;
    else if (progressMsg.indexOf('android') >= 0 || progressMsg.indexOf('recon') >= 0) currentPhase = 1;
    else if (progressMsg.indexOf('apk-mcp') >= 0 || progressMsg.indexOf('specialist') >= 0) currentPhase = 2;
    else if (progressMsg.indexOf('per-mod') >= 0 || progressMsg.indexOf('assembly') >= 0) currentPhase = 3;
    else if (progressMsg.indexOf('complete') >= 0) currentPhase = 4;
  } else {
    if (progressMsg.indexOf('recon') >= 0) currentPhase = 1;
    else if (progressMsg.indexOf('specialist') >= 0 || progressMsg.indexOf('phase 2') >= 0) currentPhase = 2;
    else if (progressMsg.indexOf('valid') >= 0 || progressMsg.indexOf('phase 3') >= 0 || progressMsg.indexOf('complete') >= 0 || progressMsg.indexOf('supplement') >= 0) currentPhase = 3;
  }

  var phaseRow = el('div', { className: 'flex items-center gap-2 mt-2' });
  for (var index = 0; index < phases.length; index++) {
    var phase = phases[index];
    var isComplete = currentPhase > phase.step;
    var isActive = currentPhase === phase.step;

    var dotClass = isComplete
      ? 'bg-emerald-400 text-slate-950'
      : isActive
        ? 'bg-cyan-400 text-slate-950 animate-pulse'
        : 'bg-white/10 text-slate-500';

    var badge = el('div', {
      className: 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ' + dotClass + ' text-[10px] font-bold transition-all',
    });
    badge.innerHTML = '<span>' + phase.icon + '</span><span>' + phase.label + '</span>';
    phaseRow.appendChild(badge);

    if (index < phases.length - 1) {
      phaseRow.appendChild(el('div', {
        className: isComplete ? 'w-4 h-px bg-emerald-400/50' : 'w-4 h-px bg-white/10',
      }));
    }
  }
  progress.appendChild(phaseRow);

  // Step counter or duration hint
  if (state.apkAttempt && state.apkMaxAttempts) {
    progress.appendChild(el('div', { className: 'text-xs text-slate-500 mt-1' },
      'Step ' + state.apkAttempt + ' of ' + state.apkMaxAttempts,
    ));
  } else if (state.apkState === 'skillmd-generating') {
    progress.appendChild(el('div', { className: 'text-xs text-amber-300 mt-1 text-center' },
      'SKILL.md generation can take 5–25+ minutes for large APKs or many mods (each step is written with phone-level precision).',
    ));
  }

  // Show the full mod catalog reference
  progress.appendChild(el('div', { className: 'mt-2 rounded-lg bg-violet-400/5 border border-violet-400/15 px-3 py-2' },
    el('p', { className: 'text-[10px] text-violet-300/80 text-center leading-relaxed' },
      '120+ mod types loaded: Resources, God Mode, Combat, Speed, Premium, VIP, Ads, SSL Bypass, Frida, IAP, Memory, IL2CPP, Save Data, Network, Spoofing, Automation & more',
    ),
  ));

  progress.appendChild(el('p', { className: 'text-[10px] text-slate-600 mt-1 text-center' }, t('app.apk.progressAnalyzing')));

  // Cancel button — stops the in-flight workflow at the next safe checkpoint
  var cancelling = !!state.apkCancelRequested;
  progress.appendChild(el('button', {
    id: 'apk-cancel-btn',
    className: 'mt-2 px-4 py-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 text-rose-300 text-xs font-bold transition hover:bg-rose-400/20 hover:border-rose-400/50 disabled:opacity-50 disabled:cursor-not-allowed',
    disabled: cancelling,
    onClick: function() {
      setState({ apkCancelRequested: true });
    },
  }, cancelling ? 'Cancelling…' : 'Cancel'));

  container.appendChild(progress);
}
