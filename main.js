// main.js - App entry point: bootstraps state, loads models (built-in or OpenRouter), wires tabs
import { getState, setState, subscribe } from './state.js';
import GUIDES from './content/guides.js';
import { $, el, t } from './ui/dom.js';
import { renderTabs } from './ui/tabs-view.js';
import { renderGuideTab } from './ui/tab-guides-view.js';
import { renderCommandsTab } from './ui/tab-commands-view.js';
import { loadPipelineConfig } from './ui/pipeline-storage.js';
import { downloadProjectZip } from './ui/project-export.js';
import * as aiSettings from './ui/ai-settings-storage.js';
import * as aiProvider from './ui/ai-provider.js';
import { openSettingsModal } from './ui/settings-view.js';

var DEFAULT_MODEL = '2a90c2e2-e87d-4f6a-be9a-108c25c6ad64';

var FALLBACK_BUILTIN_MODELS = [
  { id: DEFAULT_MODEL, title: 'DeepSeek V3.2', estimatedCostPerRun: 5 },
  { id: 'dc2db118-7888-466a-a8d1-bf9d96bab4b6', title: 'DeepSeek V4 Flash Instant', estimatedCostPerRun: 1 },
  { id: 'f07abe4e-aa96-4e38-947f-426adc3dbf4e', title: 'DeepSeek V4 Flash', estimatedCostPerRun: 1 },
  { id: 'e99081bb-cd92-4717-91ac-7378a99319ee', title: 'MiMo-V2.5', estimatedCostPerRun: 1 },
  { id: '875415fa-08d2-48a3-922f-1d9fa42a3005', title: 'DeepSeek V3', estimatedCostPerRun: 3 },
  { id: '0645fc28-c494-445f-9017-bced65fc3ea2', title: 'DeepSeek V4 Pro', estimatedCostPerRun: 4 },
];

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
    return aiSettings.loadSettings();
  }).catch(function(error) {
    console.warn('Could not load AI provider settings, using defaults', error);
  }).then(function() {
    return loadAndApplyModels();
  }).catch(function() {
    // loadAndApplyModels already applies a safe fallback; nothing more to do.
  }).then(function() {
    renderApp();
  });
});

// Fetches the model catalog for whichever provider is active (built-in
// platform models, or the user's OpenRouter account), applies a sensible
// default selection, and restores the last model the user picked for that
// provider if it's still available. Reused both at boot and whenever the
// Settings dashboard is saved.
function loadAndApplyModels() {
  return aiProvider.listModels().then(function(result) {
    var models = (result && result.models) || [];
    models.sort(function(a, b) { return (a.estimatedCostPerRun || 0) - (b.estimatedCostPerRun || 0); });
    setState({ availableModels: models });

    var provider = aiSettings.getSettings().provider;
    var remembered = aiSettings.getLastModelId(provider);
    var rememberedModel = null;
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === remembered) { rememberedModel = models[i]; break; }
    }

    if (rememberedModel) {
      setState({ selectedModelId: rememberedModel.id, aiModelId: rememberedModel.id, apkChatModelId: rememberedModel.id });
      return models;
    }

    var hasDefault = false;
    for (var j = 0; j < models.length; j++) {
      if (models[j].id === DEFAULT_MODEL) { hasDefault = true; break; }
    }
    if (!hasDefault && models.length > 0) {
      setState({ selectedModelId: models[0].id, aiModelId: models[0].id, apkChatModelId: models[0].id });
    }
    return models;
  }).catch(function(err) {
    console.warn('Could not load models, using fallback list', err);
    var provider = aiSettings.getSettings().provider;
    if (provider === 'openrouter') {
      setState({ availableModels: [] });
    } else {
      setState({ availableModels: FALLBACK_BUILTIN_MODELS });
    }
    throw err;
  });
}

function renderApp() {
  var header = $('#app-header');
  header.innerHTML = '';

  var titleBlock = el('div', { className: 'min-w-0' },
    el('p', { className: 'text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300', 'data-i18n': 'app.eyebrow' }, t('app.eyebrow')),
    el('h1', { className: 'mt-2 text-3xl sm:text-4xl font-bold text-white tracking-tight', 'data-i18n': 'app.title' }, t('app.title')),
    el('p', { className: 'mt-2 text-sm text-slate-400 max-w-xl leading-relaxed', 'data-i18n': 'app.subtitle' }, t('app.subtitle')),
  );

  var settingsBtn = el('button', {
    id: 'settings-btn',
    className: 'shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-300 hover:border-cyan-400/30 transition-colors flex items-center justify-center text-base',
    'aria-label': 'AI provider settings',
    title: 'AI Provider Settings',
    onClick: function() {
      openSettingsModal({
        onSaved: function() {
          loadAndApplyModels().catch(function() {});
        },
      });
    },
  }, el('span', { html: '&#9881;&#65039;' }));

  var dlBtn = el('button', {
    id: 'download-all-btn',
    className: 'shrink-0 h-10 px-3.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-cyan-300 hover:border-cyan-400/30 transition-colors flex items-center gap-1.5',
    onClick: function() { downloadProjectZip(); },
  }, el('span', { html: '&#11015;&#65039;' }), el('span', { className: 'hidden sm:inline' }, 'Download All Files'));

  var actions = el('div', { className: 'flex items-center gap-2 shrink-0' }, settingsBtn, dlBtn);

  header.appendChild(el('div', { className: 'mb-6 flex items-start justify-between gap-3' }, titleBlock, actions));

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
