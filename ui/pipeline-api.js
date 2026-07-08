function buildUrl(baseUrl, path) {
  var normalized = normalizePipelineBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('Enter your backend URL first.');
  }
  return normalized + path;
}

function requestJson(baseUrl, path, options) {
  return fetch(buildUrl(baseUrl, path), options || {}).then(function(response) {
    if (!response.ok) {
      return buildHttpError(response).then(function(err) { throw err; });
    }
    return response.json();
  });
}

function buildHttpError(response) {
  return response.json().then(function(body) {
    var detail = body.detail || body.message || '';
    return new Error(detail || 'Request failed with ' + response.status);
  }).catch(function() {
    return response.text().then(function(text) {
      return new Error(text || 'Request failed with ' + response.status);
    }).catch(function() {
      return new Error('Request failed with ' + response.status);
    });
  });
}

export function normalizePipelineBaseUrl(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  var withProtocol = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw;
  return withProtocol.replace(/\/+$/, '');
}

export function fetchPipelineHealth(baseUrl) {
  return requestJson(baseUrl, '/health');
}

export function submitPipelineJob(baseUrl, bytes, filename) {
  var formData = new FormData();
  var file = new File([bytes], filename, { type: 'application/zip' });
  formData.append('job_file', file);
  return requestJson(baseUrl, '/jobs', {
    method: 'POST',
    body: formData,
  });
}

export function fetchPipelineJob(baseUrl, jobId) {
  return requestJson(baseUrl, '/jobs/' + encodeURIComponent(jobId) + '/result');
}

export function fetchPipelineEvents(baseUrl, jobId) {
  return requestJson(baseUrl, '/jobs/' + encodeURIComponent(jobId) + '/events');
}

export function fetchPipelineLog(baseUrl, jobId) {
  return fetch(buildUrl(baseUrl, '/jobs/' + encodeURIComponent(jobId) + '/log')).then(function(response) {
    if (!response.ok) {
      return buildHttpError(response).then(function(err) { throw err; });
    }
    return response.text();
  });
}

export function getPipelineArtifactUrl(baseUrl, jobId) {
  return buildUrl(baseUrl, '/jobs/' + encodeURIComponent(jobId) + '/artifact');
}
