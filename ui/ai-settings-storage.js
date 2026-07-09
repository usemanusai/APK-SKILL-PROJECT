// ui/ai-settings-storage.js - Persisted AI provider configuration.
//
// Stores which AI backend is active (the built-in miniapps.ai platform models,
// or a user-supplied OpenRouter.ai account), the OpenRouter API key pool used
// for rotation, and the last model selected per provider so the app can
// restore it automatically on the next visit.
//
// Persistence is best-effort: it mirrors into the platform's async
// `miniappsAI.storage` (when available) AND a synchronous localStorage copy,
// so reads never have to block rendering and still survive a page reload
// even if the platform SDK hasn't finished loading yet.

var SETTINGS_KEY = 'apkAiProviderSettingsV1';
var MODEL_CACHE_KEY = 'apkOpenRouterModelCacheV1';
var MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

var DEFAULTS = {
  provider: 'builtin', // 'builtin' | 'openrouter'
  keys: [],            // OpenRouter API keys, rotated round-robin
  rotationIndex: 0,
  lastModelId: {
    builtin: '',
    openrouter: '',
  },
};

var cache = null;

function storageBackend() {
  try {
    if (window.miniappsAI && window.miniappsAI.storage) return window.miniappsAI.storage;
  } catch (e) {}
  return null;
}

function readLocalSync(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

function writeLocalSync(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) {}
}

function safeParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function mergeDefaults(parsed) {
  var merged = JSON.parse(JSON.stringify(DEFAULTS));
  if (parsed && typeof parsed === 'object') {
    if (parsed.provider === 'openrouter' || parsed.provider === 'builtin') merged.provider = parsed.provider;
    if (Array.isArray(parsed.keys)) {
      merged.keys = parsed.keys.filter(function(k) { return typeof k === 'string' && k.trim().length > 0; });
    }
    if (typeof parsed.rotationIndex === 'number' && parsed.rotationIndex >= 0) merged.rotationIndex = parsed.rotationIndex;
    if (parsed.lastModelId && typeof parsed.lastModelId === 'object') {
      merged.lastModelId.builtin = parsed.lastModelId.builtin || '';
      merged.lastModelId.openrouter = parsed.lastModelId.openrouter || '';
    }
  }
  return merged;
}

function persist() {
  if (!cache) return;
  var raw = JSON.stringify(cache);
  writeLocalSync(SETTINGS_KEY, raw);
  var backend = storageBackend();
  if (backend) backend.setItem(SETTINGS_KEY, raw).catch(function() {});
}

// Loads persisted settings (async platform storage preferred, sync fallback).
// Must be awaited once at boot before relying on getSettings() for anything
// provider-critical (it still works with defaults if called too early).
export function loadSettings() {
  var backend = storageBackend();
  var readPromise = backend
    ? backend.getItem(SETTINGS_KEY).catch(function() { return readLocalSync(SETTINGS_KEY); })
    : Promise.resolve(readLocalSync(SETTINGS_KEY));

  return readPromise.then(function(raw) {
    cache = mergeDefaults(safeParse(raw));
    return cache;
  }).catch(function() {
    cache = mergeDefaults(null);
    return cache;
  });
}

export function getSettings() {
  if (!cache) cache = mergeDefaults(safeParse(readLocalSync(SETTINGS_KEY)));
  return cache;
}

export function setProvider(provider) {
  getSettings().provider = (provider === 'openrouter') ? 'openrouter' : 'builtin';
  persist();
}

export function getKeys() {
  return getSettings().keys.slice();
}

export function setKeys(keys) {
  var s = getSettings();
  s.keys = (keys || []).map(function(k) { return String(k).trim(); }).filter(Boolean);
  s.rotationIndex = 0;
  persist();
}

export function addKey(key) {
  key = String(key || '').trim();
  if (!key) return;
  var s = getSettings();
  if (s.keys.indexOf(key) === -1) s.keys.push(key);
  persist();
}

export function removeKey(key) {
  var s = getSettings();
  s.keys = s.keys.filter(function(k) { return k !== key; });
  if (s.rotationIndex >= s.keys.length) s.rotationIndex = 0;
  persist();
}

export function getActiveKey() {
  var s = getSettings();
  if (!s.keys.length) return '';
  return s.keys[s.rotationIndex % s.keys.length];
}

export function getRotationIndex() {
  return getSettings().rotationIndex || 0;
}

export function setRotationIndex(idx) {
  var s = getSettings();
  s.rotationIndex = (s.keys.length > 0) ? (idx % s.keys.length) : 0;
  persist();
}

export function getLastModelId(provider) {
  return getSettings().lastModelId[provider] || '';
}

export function setLastModelId(provider, modelId) {
  if (provider !== 'builtin' && provider !== 'openrouter') return;
  if (!modelId) return;
  var s = getSettings();
  if (s.lastModelId[provider] === modelId) return;
  s.lastModelId[provider] = modelId;
  persist();
}

// ---------- OpenRouter model list cache ----------
// Keeps the last successful live fetch around so the model picker still
// works offline / while rate limited, and so we don't hammer the endpoint
// on every tab switch.

export function getCachedModels() {
  var raw = readLocalSync(MODEL_CACHE_KEY);
  var parsed = safeParse(raw);
  if (parsed && Array.isArray(parsed.models)) return parsed;
  return null;
}

export function isModelCacheFresh(cached) {
  return !!(cached && cached.models && cached.models.length > 0 && (Date.now() - cached.fetchedAt) < MODEL_CACHE_TTL_MS);
}

export function setCachedModels(models) {
  var payload = JSON.stringify({ models: models, fetchedAt: Date.now() });
  writeLocalSync(MODEL_CACHE_KEY, payload);
  var backend = storageBackend();
  if (backend) backend.setItem(MODEL_CACHE_KEY, payload).catch(function() {});
}
