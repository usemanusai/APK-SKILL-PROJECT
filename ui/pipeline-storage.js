var STORAGE_KEY = 'apkPipelineConfigV1';

var DEFAULT_CONFIG = {
  baseUrl: '',
};

export function loadPipelineConfig() {
  var storage = window.miniappsAI && window.miniappsAI.storage;
  if (!storage) return Promise.resolve({ baseUrl: '' });

  return storage.getItem(STORAGE_KEY).then(function(raw) {
    if (!raw) return { baseUrl: '' };
    try {
      var parsed = JSON.parse(raw);
      return {
        baseUrl: (parsed && typeof parsed === 'object' && parsed.baseUrl) ? parsed.baseUrl : '',
      };
    } catch (e) {
      return { baseUrl: '' };
    }
  }).catch(function() {
    return { baseUrl: '' };
  });
}

export function savePipelineConfig(config) {
  var storage = window.miniappsAI && window.miniappsAI.storage;
  if (!storage) return Promise.resolve();

  var value = JSON.stringify({
    baseUrl: (config && typeof config === 'object' && config.baseUrl) ? config.baseUrl : '',
  });
  return storage.setItem(STORAGE_KEY, value).catch(function() {});
}
