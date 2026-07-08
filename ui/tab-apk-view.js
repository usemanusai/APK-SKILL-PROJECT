// ui/tab-apk-view.js - APK tab shell with defensive lazy imports
import { getState, setState } from '../state.js';
import { el, t } from './dom.js';

// Lazy-loaded modules — each import is isolated so one failure doesn't break the whole tab
var _mods = {};

function lazy(name, path) {
  if (_mods[name]) return Promise.resolve(_mods[name]);
  return import(path).then(function(mod) {
    _mods[name] = mod;
    return mod;
  });
}

export function renderApkTab(container) {
  var s = getState();
  container.innerHTML = '';
  container.appendChild(buildHeader());

  // Always stay in the loaded APK view if we have APK data in state.
  // This prevents the entire UI from resetting back to the upload screen
  // during long-running operations like autonomous SKILL.md generation.
  var hasLoadedApkData = !!(s.apkFile && (s.apkFile.allFiles || s.apkFile.zip || (s.apkMods && s.apkMods.length > 0)));
  if (hasLoadedApkData || s.apkState === 'loaded' || s.apkState === 'analyzing' || s.apkState === 'complete' || s.apkState === 'skillmd-generating') {
    renderLoadedState(container, s);
    return;
  }

  // Upload area — needs helpers + actions + upload-view
  Promise.all([
    lazy('actions', './apk-tab/actions.js'),
    lazy('uploadView', './apk-tab/upload-view.js'),
  ]).then(function(mods) {
    var actions = mods[0];
    var uploadView = mods[1];
    uploadView.renderUploadArea(container, actions.handleAPKFile);

    if (getState().apkState === 'error') {
      container.appendChild(renderUploadError());
    }
  }).catch(function(err) {
    console.error('Failed to load APK upload modules:', err);
    container.appendChild(el('p', { className: 'text-rose-400 text-center py-8' },
      'Failed to load APK modules: ' + err.message
    ));
  });
}

function buildHeader() {
  return el('div', { className: 'mb-5' },
    el('h2', { className: 'text-lg font-bold text-white flex items-center gap-2' },
      el('span', { html: '&#128230;' }),
      t('app.apk.title')
    ),
    el('p', { className: 'text-xs text-slate-400 mt-1 leading-relaxed' },
      t('app.apk.subtitle')
    ),
  );
}

function renderLoadedState(container, state) {
  // Load all needed modules in parallel
  Promise.all([
    lazy('helpers', './apk-tab/helpers.js'),
    lazy('actions', './apk-tab/actions.js'),
    lazy('summaryView', './apk-tab/summary-view.js'),
    lazy('analysisView', './apk-tab/analysis-view.js'),
    lazy('modsView', './apk-tab/mods-view.js'),
    lazy('browserView', './apk-tab/browser-view.js'),
    lazy('pipelinePanel', './pipeline-panel-view.js'),
    lazy('chatView', './apk-tab/chat-view.js'),
  ]).then(function(mods) {
    var helpers = mods[0];
    var actions = mods[1];
    var summaryView = mods[2];
    var analysisView = mods[3];
    var modsView = mods[4];
    var browserView = mods[5];
    var pipelinePanel = mods[6];
    var chatView = mods[7];

    var s = getState();
    var reset = function() { setState(helpers.getApkResetPatch()); };

    summaryView.renderApkSummary(container, s.apkFile, s.apkManifest, reset, s);
    analysisView.renderAnalysisSection(container, actions.runApkAnalysis);

    // Chat panel: init history then render
    chatView.initApkChat().then(function() {
      chatView.renderApkChatPanel(container);
      pipelinePanel.renderPipelinePanel(container);

      // Always show the full loaded APK UI (mods list + browser) as long as we have the APK data loaded.
      // This prevents the view from "resetting" or hiding mods during long-running operations like SKILL.md generation.
      var hasApkData = !!(s.apkFile && s.apkMods && s.apkMods.length > 0);
      if (hasApkData) {
        modsView.renderApkMods(container, actions.toggleCategory, actions.exportRebuildJob);
      }

      browserView.renderFileBrowser(container, s.apkCategories);
    }).catch(function(err) {
      console.warn('APK chat init failed, rendering without chat:', err);
      pipelinePanel.renderPipelinePanel(container);

      var hasApkData2 = !!(s.apkFile && s.apkMods && s.apkMods.length > 0);
      if (hasApkData2) {
        modsView.renderApkMods(container, actions.toggleCategory, actions.exportRebuildJob);
      }

      browserView.renderFileBrowser(container, s.apkCategories);
    });
  }).catch(function(err) {
    console.error('Failed to load APK tab modules:', err);
    container.appendChild(el('p', { className: 'text-rose-400 text-center py-8' },
      'Failed to load APK tab: ' + err.message
    ));
  });
}

function renderUploadError() {
  var s = getState();
  return el('div', { className: 'mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3' },
    el('div', { className: 'flex items-center gap-2' },
      el('span', { className: 'text-sm' }, '&#9888;&#65039;'),
      el('span', { className: 'text-sm text-rose-300' }, s.apkError || t('app.apk.uploadErrorDefault')),
    ),
    el('button', {
      className: 'mt-2 text-xs text-rose-400 hover:text-rose-300 underline',
      onClick: function() { setState({ apkState: null, apkError: null }); },
    }, t('app.apk.tryAgain')),
  );
}
