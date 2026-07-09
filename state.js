// state.js - Central state management
import { getSettings, setLastModelId } from './ui/ai-settings-storage.js';

var DEFAULT_MODEL = '2a90c2e2-e87d-4f6a-be9a-108c25c6ad64'; // DeepSeek V3.2

// Any of these fields holding a model id means the user actively picked a
// model somewhere in the app; remember it as "last used" for the active
// provider so it's restored automatically next time (see ai-settings-storage.js).
var MODEL_ID_KEYS = ['selectedModelId', 'aiModelId', 'apkChatModelId'];

var state = {
  activeTab: 'guides',
  chatMessages: [],
  selectedModelId: DEFAULT_MODEL,
  isLoading: false,
  expandedGuides: {},
  searchQuery: '',
  availableModels: [],
  // File editor state
  editorFileType: 'manifest',
  editorContent: '',
  editorAppliedMods: [],
  editorShowDiff: false,
  editorLastContent: '',
  editorModInputs: {},
  // AI analysis state
  aiAnalyzing: false,
  aiMods: [],
  aiError: null,
  aiModelId: DEFAULT_MODEL,
  aiAttempt: 0,
  aiMaxAttempts: 3,
  aiProgressMsg: '',
  // APK import & autonomous workflow state
  apkState: null,
  apkFile: null,
  apkManifest: null,
  apkCategories: null,
  apkKeyFiles: null,
  apkMods: [],
  apkAppliedMods: [],
  apkError: null,
  apkAnalysisError: null,
  apkAttempt: 0,
  apkMaxAttempts: 3,
  apkProgressMsg: '',
  apkBuildReport: null,
  apkBuildError: null,
  apkShowFileBrowser: false,
  apkExpandedMods: [],
  // Backend pipeline state
  pipelineBaseUrl: '',
  pipelineHealth: null,
  pipelineTesting: false,
  pipelineSubmitting: false,
  pipelineRefreshing: false,
  pipelineJobId: null,
  pipelineJob: null,
  pipelineLog: '',
  pipelineError: null,
  // APK Chat state
  apkChatMessages: [],
  apkChatModelId: DEFAULT_MODEL,
  apkChatLoading: false,
  apkChatFollowUps: [],
  // SKILL.md export mode: 'mcp' or 'mobile'
  skillMdMode: 'mcp',
  skillMdGenerating: false,
  // Pending generated SKILL.md result (for reliable download after long runs)
  skillMdResult: null,        // { content: string, filename: string, mode: 'mcp'|'mobile' }
  // User adjustments to the last generated SKILL.md (session only)
  skillMdEditedContent: null, // string | null — overrides result.content for downloads when set

  // Pre-generation options for what to include/exclude in SKILL.md
  skillMdOptions: {
    includeSetup: true,           // Steps 1-3 MCP setup
    includePerMod: true,          // Detailed steps for each selected mod
    includeTroubleshooting: true, // Troubleshooting matrix
    includeDynamicWaits: true,    // Dynamic wait conditions table
    includeInventory: true,       // File inventory (especially mobile)
    includeWarnings: true,        // Ethical warnings & out-of-scope
    includeFullFiles: true,       // Complete replacement file contents
    includeDiffs: true,           // Diffs
    includeFrida: true,           // Frida scripts
    mobileScreenshots: true,      // Screenshot placeholders in mobile mode
    includeValidation: true       // NEW: Validation, verification steps & post-edit screenshots (e.g. "screenshot unlocked features")
  },

  // Desired number of mods to document in SKILL.md (user-controlled, max 18)
  // Starts at 3 by default. User can increase and re-generate until reaching 18.
  skillMdTargetCount: 3
};

var listeners = [];

export function getState() {
  return state;
}

export function setState(patch) {
  if ('editorContent' in patch && patch.editorContent !== state.editorContent) {
    state.editorLastContent = state.editorContent;
  }
  Object.assign(state, patch);
  for (var mi = 0; mi < MODEL_ID_KEYS.length; mi++) {
    var key = MODEL_ID_KEYS[mi];
    if (key in patch && patch[key]) {
      try { setLastModelId(getSettings().provider, patch[key]); } catch (e) { /* best-effort */ }
    }
  }
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](state); } catch (e) { console.warn('Listener error:', e); }
  }
}

export function subscribe(fn) {
  listeners.push(fn);
  return function() {
    var idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
