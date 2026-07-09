// ui/ai-provider.js - Unified AI provider abstraction.
//
// Every feature in this app (chat, mod analysis, SKILL.md generation, ...)
// calls two functions: listModels() and callModel({ modelId, messages, timeoutMs }),
// then extractText(result) to read the reply. This module routes those calls to
// either:
//   - the built-in miniapps.ai platform SDK (window.miniappsAI), or
//   - a user-supplied OpenRouter.ai account (BYO API key, with rotation)
// transparently, based on the persisted provider setting. Callers never need
// to know which backend served the request.

import * as settings from './ai-settings-storage.js';

var OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
var OPENROUTER_TITLE = 'APK Structure Analyzer';

function referer() {
  try { return window.location.href; } catch (e) { return 'https://apk-structure-analyzer.miniapps.ai'; }
}

var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_RETRY_BASE_DELAY_MS = 500;
var RETRY_DELAY_CAP_MS = 4000;

function wait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// Exponential backoff with a small amount of jitter, capped so a long
// multi-phase workflow never stalls too long on a single transient blip.
function computeRetryDelay(attemptNumber, baseDelayMs) {
  var exp = baseDelayMs * Math.pow(2, attemptNumber);
  var capped = Math.min(exp, RETRY_DELAY_CAP_MS);
  var jitter = Math.random() * (capped * 0.15);
  return Math.round(capped + jitter);
}

// Best-effort classification of miniappsAI SDK errors: only retry things that
// look transient (network hiccup, timeout, or a 429/5xx-ish status if the
// SDK's error shape exposes one). Errors that are clearly user/config issues
// (bad request, unauthorized, or the SDK being unavailable) are not retried
// since another attempt won't change the outcome.
function isTransientMiniappsError(err) {
  if (!err) return true;
  var status = err.status || (err.response && err.response.status) || err.statusCode;
  if (status) {
    return status === 429 || status >= 500;
  }
  var msg = String((err && err.message) || err || '').toLowerCase();
  if (!msg) return true;
  if (msg.indexOf('unavailable') >= 0 && msg.indexOf('sdk') >= 0) return false;
  if (msg.indexOf('bad request') >= 0) return false;
  if (msg.indexOf('invalid') >= 0) return false;
  if (msg.indexOf('unauthorized') >= 0) return false;
  if (msg.indexOf('forbidden') >= 0) return false;
  if (msg.indexOf('not found') >= 0) return false;
  return true;
}

export function getActiveProvider() {
  return settings.getSettings().provider;
}

export function isOpenRouterActive() {
  return getActiveProvider() === 'openrouter';
}

export function hasOpenRouterKeys() {
  return settings.getKeys().length > 0;
}

// ---------- Model listing ----------

export function listModels(opts) {
  var force = !!(opts && opts.forceRefresh);
  if (isOpenRouterActive()) {
    return listOpenRouterModels(force);
  }
  if (!window.miniappsAI || typeof window.miniappsAI.listModels !== 'function') {
    return Promise.reject(new Error('Built-in AI SDK is unavailable in this environment.'));
  }
  return window.miniappsAI.listModels({});
}

function listOpenRouterModels(force) {
  var cached = settings.getCachedModels();
  if (!force && settings.isModelCacheFresh(cached)) {
    return Promise.resolve({ models: cached.models, fromCache: true, fetchedAt: cached.fetchedAt });
  }

  var headers = { 'Content-Type': 'application/json' };
  var key = settings.getActiveKey();
  if (key) headers['Authorization'] = 'Bearer ' + key;

  return fetch(OPENROUTER_BASE + '/models', { headers: headers })
    .then(function(res) {
      if (!res.ok) throw new Error('OpenRouter model list request failed (HTTP ' + res.status + ')');
      return res.json();
    })
    .then(function(json) {
      var data = (json && json.data) || [];
      var models = data.map(normalizeOpenRouterModel).filter(Boolean);
      models.sort(function(a, b) {
        if (a.estimatedCostPerRun !== b.estimatedCostPerRun) return a.estimatedCostPerRun - b.estimatedCostPerRun;
        return a.title.localeCompare(b.title);
      });
      settings.setCachedModels(models);
      return { models: models, fromCache: false, fetchedAt: Date.now() };
    })
    .catch(function(err) {
      if (cached && cached.models && cached.models.length > 0) {
        return { models: cached.models, fromCache: true, fetchedAt: cached.fetchedAt, staleError: err };
      }
      throw err;
    });
}

function normalizeOpenRouterModel(m) {
  if (!m || !m.id) return null;
  var pricing = m.pricing || {};
  var promptPrice = parseFloat(pricing.prompt || '0') || 0;
  var completionPrice = parseFloat(pricing.completion || '0') || 0;
  var blended = (promptPrice + completionPrice) / 2;
  // Scale $/token into a rough "credits" figure so the existing cost badge UI
  // (built for the platform's credit system) stays meaningful for OpenRouter
  // models too: ~$1 per million blended tokens == 1 credit, floor of 1.
  var estimatedCostPerRun = blended <= 0 ? 0 : Math.max(1, Math.round(blended * 1000000));
  var architecture = m.architecture || {};
  var modality = architecture.modality || 'text->text';
  var inputMods = architecture.input_modalities || [];
  var outputMods = architecture.output_modalities || [];

  return {
    id: m.id,
    title: m.name || m.id,
    estimatedCostPerRun: estimatedCostPerRun,
    capabilitySummary: (m.description || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    capabilities: {
      textInput: inputMods.indexOf('text') >= 0 || modality.indexOf('text->') === 0,
      imageInput: inputMods.indexOf('image') >= 0,
      imageOutput: outputMods.indexOf('image') >= 0,
      audioInput: inputMods.indexOf('audio') >= 0,
      audioOutput: outputMods.indexOf('audio') >= 0,
      videoOutput: outputMods.indexOf('video') >= 0,
    },
    contextLength: m.context_length || null,
    isFree: blended === 0,
    provider: 'openrouter',
  };
}

// ---------- Chat completions ----------

export function callModel(params) {
  var maxRetries = (params && params.maxRetries != null) ? params.maxRetries : DEFAULT_MAX_RETRIES;
  var retryBaseDelayMs = (params && params.retryBaseDelayMs != null) ? params.retryBaseDelayMs : DEFAULT_RETRY_BASE_DELAY_MS;

  if (isOpenRouterActive()) {
    return callOpenRouter(params, maxRetries, retryBaseDelayMs);
  }
  return callMiniappsAI(params, maxRetries, retryBaseDelayMs);
}

function callMiniappsAI(params, maxRetries, retryBaseDelayMs) {
  function attempt(attemptNumber) {
    if (!window.miniappsAI || typeof window.miniappsAI.callModel !== 'function') {
      return Promise.reject(new Error('Built-in AI SDK is unavailable in this environment.'));
    }
    return Promise.resolve().then(function() {
      return window.miniappsAI.callModel(params);
    }).catch(function(err) {
      if (attemptNumber < maxRetries && isTransientMiniappsError(err)) {
        var delayMs = computeRetryDelay(attemptNumber, retryBaseDelayMs);
        return wait(delayMs).then(function() {
          return attempt(attemptNumber + 1);
        });
      }
      throw err;
    });
  }
  return attempt(0);
}

export function extractText(result) {
  if (result && result.__provider === 'openrouter') {
    return extractOpenRouterText(result);
  }
  if (window.miniappsAI && typeof window.miniappsAI.extractText === 'function') {
    try { return window.miniappsAI.extractText(result); } catch (e) { /* fall through */ }
  }
  return '';
}

function extractOpenRouterText(result) {
  try {
    var choice = result.choices && result.choices[0];
    if (!choice) return '';
    var msg = choice.message || {};
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map(function(part) { return (part && part.text) ? part.text : ''; }).join('');
    }
    return '';
  } catch (e) {
    return '';
  }
}

function callOpenRouter(params, maxRetries, retryBaseDelayMs) {
  var keys = settings.getKeys();
  if (!keys.length) {
    return Promise.reject(new Error('No OpenRouter API key configured. Add one in AI Provider Settings.'));
  }

  if (maxRetries == null) maxRetries = DEFAULT_MAX_RETRIES;
  if (retryBaseDelayMs == null) retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS;

  var timeoutMs = params.timeoutMs || 60000;
  var startIndex = settings.getRotationIndex() % keys.length;
  // maxRetries counts additional passes over the whole key pool, on top of
  // trying every key once; caps total attempts so retries + key rotation
  // never explode uncontrollably.
  var maxAttempts = keys.length * (maxRetries + 1);

  function attemptWithKey(offset) {
    var idx = (startIndex + offset) % keys.length;
    var key = keys[idx];

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

    var body = {
      model: params.modelId,
      messages: params.messages,
      stream: false,
    };
    if (params.temperature != null) body.temperature = params.temperature;
    if (params.maxTokens != null) body.max_tokens = params.maxTokens;

    return fetch(OPENROUTER_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': referer(),
        'X-Title': OPENROUTER_TITLE,
      },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    }).then(function(res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return res.json().catch(function() { return null; }).then(function(errJson) {
          var msg = (errJson && errJson.error && errJson.error.message) || ('OpenRouter request failed (HTTP ' + res.status + ')');
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    }).then(function(json) {
      // Round-robin: next call starts from the following key regardless of
      // outcome, spreading load evenly across the whole key pool.
      settings.setRotationIndex((idx + 1) % keys.length);
      json.__provider = 'openrouter';
      return json;
    }).catch(function(err) {
      if (timer) clearTimeout(timer);
      if (err.name === 'AbortError') {
        var timeoutErr = new Error('Request timed out');
        timeoutErr.name = 'timeout';
        throw timeoutErr;
      }
      var retriable = err.status === 401 || err.status === 402 || err.status === 429 || (err.status && err.status >= 500);
      if (retriable && offset + 1 < maxAttempts) {
        if (maxRetries === 0) {
          return attemptWithKey(offset + 1);
        }
        var delayMs = computeRetryDelay(offset, retryBaseDelayMs);
        return wait(delayMs).then(function() {
          return attemptWithKey(offset + 1);
        });
      }
      throw err;
    });
  }

  return attemptWithKey(0);
}

// ---------- Key validation (used by the Settings dashboard "Test" button) ----------

export function validateOpenRouterKey(key) {
  key = String(key || '').trim();
  if (!key) return Promise.reject(new Error('Enter an API key first.'));
  return fetch(OPENROUTER_BASE + '/key', {
    headers: { 'Authorization': 'Bearer ' + key },
  }).then(function(res) {
    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid API key.');
      throw new Error('Could not validate key (HTTP ' + res.status + ')');
    }
    return res.json();
  }).then(function(json) {
    return (json && json.data) || {};
  });
}
