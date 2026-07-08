// main.js - App entry point: bootstraps state, loads ALL models, wires tabs
import { getState, setState, subscribe } from './state.js';
import GUIDES from './content/guides.js';
import { $, el, t } from './ui/dom.js';
import { renderTabs } from './ui/tabs-view.js';
import { renderGuideTab } from './ui/tab-guides-view.js';
import { renderCommandsTab } from './ui/tab-commands-view.js';
import { loadPipelineConfig } from './ui/pipeline-storage.js';
import { downloadProjectZip } from './ui/project-export.js';

var DEFAULT_MODEL = '2a90c2e2-e87d-4f6a-be9a-108c25c6ad64';

var GUIDE_TABS = {
  guides: 'guides',
  modding: 'modding',
};

document.addEventListener('DOMContentLoaded', function() {
  loadPipelineConfig().then(function(pipelineConfig) {
    if (pipelineConfig && pipelineConfig.baseUrl) {
      setState({ pipelineBaseUrl: pipelineConfig.baseUrl });
    }
  }).catch(function(error) {
    console.warn('Could not load saved pipeline config', error);
  }).then(function() {
    return window.miniappsAI.listModels({});
  }).then(function(result) {
    var models = result.models || [];
    models.sort(function(a, b) { return (a.estimatedCostPerRun || 0) - (b.estimatedCostPerRun || 0); });
    setState({ availableModels: models });
    var hasDefault = false;
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === DEFAULT_MODEL) { hasDefault = true; break; }
    }
    if (!hasDefault && models.length > 0) {
      setState({ selectedModelId: models[0].id, aiModelId: models[0].id });
    }
  }).catch(function() {
    console.warn('Could not load models, using fallback list');
    setState({ availableModels: [
      { id: DEFAULT_MODEL, title: 'DeepSeek V3.2', estimatedCostPerRun: 5 },
      { id: 'dc2db118-7888-466a-a8d1-bf9d96bab4b6', title: 'DeepSeek V4 Flash Instant', estimatedCostPerRun: 1 },
      { id: 'f07abe4e-aa96-4e38-947f-426adc3dbf4e', title: 'DeepSeek V4 Flash', estimatedCostPerRun: 1 },
      { id: 'e99081bb-cd92-4717-91ac-7378a99319ee', title: 'MiMo-V2.5', estimatedCostPerRun: 1 },
      { id: '875415fa-08d2-48a3-922f-1d9fa42a3005', title: 'DeepSeek V3', estimatedCostPerRun: 3 },
      { id: '0645fc28-c494-445f-9017-bced65fc3ea2', title: 'DeepSeek V4 Pro', estimatedCostPerRun: 4 },
    ]});
  }).then(function() {
    renderApp();
  });
});

function renderApp() {
  var header = $('#app-header');
  header.innerHTML =
    '<div class="mb-6 flex items-start justify-between gap-3">' +
      '<div>' +
        '<p class="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300" data-i18n="app.eyebrow">' + t('app.eyebrow') + '</p>' +
        '<h1 class="mt-2 text-3xl sm:text-4xl font-bold text-white" data-i18n="app.title">' + t('app.title') + '</h1>' +
        '<p class="mt-2 text-sm text-slate-400 max-w-xl" data-i18n="app.subtitle">' + t('app.subtitle') + '</p>' +
      '</div>' +
      '<button id="download-all-btn" class="shrink-0 mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-cyan-300 hover:border-cyan-400/30 transition-colors flex items-center gap-1.5">' +
        '<span>&#11015;</span> Download All Files' +
      '</button>' +
    '</div>';

  var dlBtn = document.getElementById('download-all-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', function() { downloadProjectZip(); });
  }

  var searchWrap = $('#search-wrap');
  searchWrap.innerHTML =
    '<input type="text" id="search-input" ' +
    'class="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition" ' +
    'placeholder="' + t('app.common.search') + '" ' +
    'aria-label="' + t('app.common.search') + '" />';

  var searchInput = $('#search-input');
  searchInput.addEventListener('input', function(e) {
    setState({ searchQuery: e.target.value });
  });

  var tabBar = $('#tab-bar');
  renderTabs(tabBar);

  renderContent();

  subscribe(function() {
    renderTabs(tabBar);
    renderContent();
    var si = $('#search-input');
    if (si && si.value !== getState().searchQuery) {
      si.value = getState().searchQuery;
    }
  });
}

function renderContent() {
  var s = getState();
  var contentEl = $('#main-content');
  if (!contentEl) return;

  var searchWrap = $('#search-wrap');
  if (searchWrap) {
    var hideForTabs = ['aiAssistant', 'fileEditor', 'apkImport'];
    searchWrap.style.display = hideForTabs.indexOf(s.activeTab) >= 0 ? 'none' : '';
  }

  if (GUIDE_TABS[s.activeTab]) {
    contentEl.id = 'main-content';
    renderGuideTab(contentEl, GUIDES[GUIDE_TABS[s.activeTab]], s.activeTab);
    return;
  }

  if (s.activeTab === 'apkImport') {
    import('./ui/tab-apk-view.js').then(function(mod) {
      mod.renderApkTab(contentEl);
    }).catch(function(err) {
      console.error('Failed to load APK tab:', err);
      contentEl.innerHTML = '<p class="text-rose-400 text-center py-8">Failed to load APK tab: ' + err.message + '</p>';
    });
    return;
  }

  if (s.activeTab === 'fileEditor') {
    import('./ui/tab-editor-view.js').then(function(mod) {
      mod.renderEditorTab(contentEl);
    }).catch(function(err) {
      console.error('Failed to load editor tab:', err);
      contentEl.innerHTML = '<p class="text-rose-400 text-center py-8">Failed to load editor tab: ' + err.message + '</p>';
    });
    return;
  }

  if (s.activeTab === 'aiAssistant') {
    import('./ui/tab-ai-view.js').then(function(mod) {
      mod.renderAiTab(contentEl);
    }).catch(function(err) {
      console.error('Failed to load AI tab:', err);
      contentEl.innerHTML = '<p class="text-rose-400 text-center py-8">Failed to load AI tab: ' + err.message + '</p>';
    });
    return;
  }

  if (s.activeTab === 'commands') {
    renderCommandsTab(contentEl, GUIDES.commands);
    return;
  }

  contentEl.innerHTML = '<p class="text-slate-500 text-center py-8">Select a tab to get started.</p>';
}
