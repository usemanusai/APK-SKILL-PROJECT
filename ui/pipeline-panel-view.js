import { getState, setState } from '../state.js';
import { el, showToast, t } from './dom.js';
import { buildRebuildHandoffBundle } from './rebuild-handoff.js';
import {
  normalizePipelineBaseUrl,
  fetchPipelineHealth,
  submitPipelineJob,
  fetchPipelineJob,
  fetchPipelineLog,
  getPipelineArtifactUrl,
} from './pipeline-api.js';
import { savePipelineConfig } from './pipeline-storage.js';

var pollTimer = null;

export function renderPipelinePanel(container) {
  var s = getState();
  var card = el('section', {
    className: 'mb-4 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-400/[0.05] to-cyan-400/[0.04] p-4',
  });

  card.appendChild(el('div', { className: 'flex items-start justify-between gap-3 mb-3 flex-wrap' },
    el('div', {},
      el('h3', { className: 'text-sm font-bold text-white flex items-center gap-2' },
        el('span', { html: '&#128421;' }),
        t('app.pipeline.title')
      ),
      el('p', { className: 'text-xs text-slate-400 mt-1 leading-relaxed' },
        t('app.pipeline.subtitle')
      ),
    ),
    el('span', { className: 'text-[10px] px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/20 font-bold' }, t('app.pipeline.badge'))
  ));

  var row = el('div', { className: 'flex flex-col sm:flex-row gap-2 mb-3' });
  var input = el('input', {
    type: 'text',
    value: s.pipelineBaseUrl || '',
    className: 'flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-400/50',
    placeholder: t('app.pipeline.placeholder'),
    'aria-label': t('app.pipeline.urlAria'),
  });
  input.addEventListener('input', function(event) {
    setState({ pipelineBaseUrl: event.target.value.trim() });
  });

  row.appendChild(input);
  row.appendChild(el('button', {
    className: 'px-3 py-2.5 rounded-xl bg-white/5 text-slate-200 border border-white/10 hover:border-white/20 text-xs font-semibold',
    onClick: function() {
      var baseUrl = normalizePipelineBaseUrl(input.value);
      setState({ pipelineBaseUrl: baseUrl, pipelineError: null });
      savePipelineConfig({ baseUrl }).then(function() {
        showToast(t('app.pipeline.savedToast'));
      });
    },
  }, t('app.pipeline.saveUrl')));
  row.appendChild(el('button', {
    className: 'px-3 py-2.5 rounded-xl bg-white/5 text-slate-200 border border-white/10 hover:border-white/20 text-xs font-semibold disabled:opacity-40',
    disabled: s.pipelineTesting,
    onClick: function() {
      var baseUrl = normalizePipelineBaseUrl(input.value);
      if (!baseUrl) {
        showToast(t('app.pipeline.enterUrlToast'));
        return;
      }
      setState({ pipelineTesting: true, pipelineError: null, pipelineBaseUrl: baseUrl });
      savePipelineConfig({ baseUrl }).then(function() {
        return fetchPipelineHealth(baseUrl);
      }).then(function(health) {
        setState({ pipelineHealth: health, pipelineTesting: false });
        showToast(t('app.pipeline.connectionOk'));
      }).catch(function(error) {
        setState({ pipelineTesting: false, pipelineError: error.message });
        showToast(t('app.pipeline.connectionFail', { error: error.message }));
      });
    },
  }, s.pipelineTesting ? t('app.pipeline.testing') : t('app.pipeline.testConnection')));
  card.appendChild(row);

  var hasHealth = s.pipelineHealth && s.pipelineHealth.config;
  if (hasHealth) {
    var health = s.pipelineHealth;
    card.appendChild(el('div', { className: 'mb-3 flex flex-wrap gap-2 text-[11px]' },
      badge(t(health.worker_busy ? 'app.pipeline.workerBusy' : 'app.pipeline.workerIdle')),
      badge(t('app.pipeline.queuedBadge', { count: health.queued_jobs || 0 })),
      badge(t('app.pipeline.retentionBadge', { hours: health.config.retentionHours })),
      badge(t('app.pipeline.uploadBadge', { mb: health.config.maxUploadMb })),
      health.free_disk_gb != null ? badge(t('app.pipeline.freeDiskBadge', { gb: health.free_disk_gb })) : null,
    ));
  }

  var hasSelection = (s.apkAppliedMods || []).length > 0;
  var submitDisabled = s.pipelineSubmitting || !hasSelection || !s.pipelineBaseUrl;
  card.appendChild(el('div', { className: 'flex items-center justify-between gap-3 flex-wrap mb-3' },
    el('p', { className: 'text-xs text-slate-400' },
      hasSelection
        ? t('app.pipeline.selectionReady', { count: (s.apkAppliedMods || []).length })
        : t('app.pipeline.selectionMissing')
    ),
    el('div', { className: 'flex items-center gap-2 flex-wrap' },
      el('button', {
        className: 'px-3 py-2 rounded-xl bg-white/5 text-slate-200 border border-white/10 hover:border-white/20 text-xs font-semibold disabled:opacity-40',
        disabled: !s.pipelineJobId || s.pipelineRefreshing,
        onClick: function() { refreshPipelineJob(true); },
      }, s.pipelineRefreshing ? t('app.pipeline.refreshing') : t('app.pipeline.refresh')),
      el('button', {
        className: 'px-4 py-2 rounded-xl bg-gradient-to-r from-violet-400 to-cyan-400 text-slate-950 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed',
        disabled: submitDisabled,
        onClick: function() { submitCurrentSelection(); },
      }, s.pipelineSubmitting ? t('app.pipeline.submitting') : t('app.pipeline.submit')),
    )
  ));

  if (s.pipelineError) {
    card.appendChild(el('div', { className: 'mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 leading-relaxed' }, s.pipelineError));
  }

  if (s.pipelineJob) {
    var job = s.pipelineJob;
    var done = job.status === 'completed';
    var failed = job.status === 'failed';
    var artifactUrl = done ? getPipelineArtifactUrl(s.pipelineBaseUrl, job.id) : '';

    var statusClass = failed ? 'border-rose-500/25 bg-rose-500/8' : done ? 'border-emerald-500/25 bg-emerald-500/8' : 'border-cyan-500/20 bg-cyan-500/[0.05]';
    var box = el('div', { className: 'rounded-xl border px-3 py-3 mb-3 ' + statusClass },
      el('div', { className: 'flex items-center justify-between gap-2 flex-wrap' },
        el('div', { className: 'flex items-center gap-2 flex-wrap' },
          el('span', { className: 'text-xs font-bold text-white' }, t('app.pipeline.jobLabel', { id: job.id })),
          badge(job.status),
          badge(job.stage || 'queued'),
          badge((job.progress || 0) + '%'),
          job.output_kind ? badge(job.output_kind) : null,
          job.verified ? badge(t('app.pipeline.verified')) : null,
        ),
        done
          ? el('a', {
            href: artifactUrl,
            target: '_blank',
            rel: 'noreferrer',
            className: 'text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline',
          }, t('app.pipeline.downloadArtifact'))
          : null,
      ),
      job.output_name ? el('p', { className: 'text-[11px] text-slate-300 mt-2' }, t('app.pipeline.outputLabel', { name: job.output_name })) : null,
      job.error_code ? el('p', { className: 'text-[11px] text-rose-300 mt-2 font-semibold' }, t('app.pipeline.errorCodeLabel', { code: job.error_code })) : null,
      job.error_message ? el('p', { className: 'text-[11px] text-rose-200 mt-2 leading-relaxed' }, job.error_message) : null,
    );

    // Verification items — use loops instead of spread to avoid sandbox parser issues
    var verificationItems = buildVerificationItems(job);
    if (verificationItems.length) {
      var vList = el('ul', { className: 'mt-2 space-y-1' });
      for (var vi = 0; vi < verificationItems.length; vi++) {
        (function(item) {
          vList.appendChild(el('li', { className: 'text-[11px] text-slate-300 leading-relaxed flex gap-2' },
            el('span', { className: 'text-cyan-300' }, '\u2022'),
            el('span', {}, item),
          ));
        })(verificationItems[vi]);
      }
      box.appendChild(vList);
    }

    if (job.warnings && job.warnings.length) {
      var warnDiv = el('div', { className: 'mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2' });
      warnDiv.appendChild(el('p', { className: 'text-[11px] font-semibold text-amber-200 mb-1' }, t('app.pipeline.warningsTitle')));
      var wList = el('ul', { className: 'space-y-1' });
      for (var wi = 0; wi < job.warnings.length; wi++) {
        (function(warning) {
          wList.appendChild(el('li', { className: 'text-[11px] text-amber-100/90 leading-relaxed flex gap-2' },
            el('span', { className: 'text-amber-300' }, '\u2022'),
            el('span', {}, warning),
          ));
        })(job.warnings[wi]);
      }
      warnDiv.appendChild(wList);
      box.appendChild(warnDiv);
    }

    card.appendChild(box);
  }

  if (s.pipelineLog) {
    card.appendChild(el('div', { className: 'rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden' },
      el('div', { className: 'px-3 py-2 border-b border-white/10 text-xs font-semibold text-slate-300' }, t('app.pipeline.logTitle')),
      el('pre', { className: 'max-h-64 overflow-auto p-3 text-[11px] leading-relaxed text-cyan-100 whitespace-pre-wrap' }, s.pipelineLog),
    ));
  }

  container.appendChild(card);
  schedulePolling();
}

function badge(text) {
  return el('span', { className: 'text-[10px] px-2 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10 font-semibold' }, text);
}

function buildVerificationItems(job) {
  var verification = job.verification || {};
  var details = [];

  if (verification.zipaligned) details.push(t('app.pipeline.verifyZipaligned'));
  if (verification.signed) details.push(t('app.pipeline.verifySigned'));
  if (verification.verifiedWith) details.push(t('app.pipeline.verifyWith', { tool: verification.verifiedWith }));
  if (typeof verification.targetedMemberCount === 'number') details.push(t('app.pipeline.verifyTargetedMembers', { count: verification.targetedMemberCount }));
  if (typeof verification.apkMemberCount === 'number') details.push(t('app.pipeline.verifyApkMembers', { count: verification.apkMemberCount }));
  if (verification.bundleValidated) details.push(t('app.pipeline.verifyBundleValidated'));
  if (verification.apksArchiveVerified) details.push(t('app.pipeline.verifyApksVerified'));
  if (typeof verification.replacementCount === 'number') details.push(t('app.pipeline.verifyReplacementCount', { count: verification.replacementCount }));

  return details;
}

function submitCurrentSelection() {
  var s = getState();
  var baseUrl = normalizePipelineBaseUrl(s.pipelineBaseUrl);
  if (!baseUrl) {
    showToast(t('app.pipeline.enterUrlToast'));
    return;
  }

  var selectedMods = s.apkMods.filter(function(mod) { return (s.apkAppliedMods || []).indexOf(mod.id) >= 0; });
  if (selectedMods.length === 0) {
    showToast(t('app.pipeline.selectFirstToast'));
    return;
  }

  setState({ pipelineSubmitting: true, pipelineError: null, pipelineBaseUrl: baseUrl });
  savePipelineConfig({ baseUrl }).then(function() {
    return buildRebuildHandoffBundle({
      apk: s.apkFile,
      manifest: s.apkManifest,
      mods: selectedMods,
    });
  }).then(function(handoff) {
    return submitPipelineJob(baseUrl, handoff.bundleBytes, handoff.fileName).then(function(created) {
      setState({
        apkBuildReport: handoff.report,
        apkBuildError: null,
        pipelineSubmitting: false,
        pipelineJobId: created.job_id,
        pipelineJob: { id: created.job_id, status: created.status, stage: 'queued', progress: 0 },
        pipelineLog: '',
      });
      showToast(t('app.pipeline.queuedToast', { id: created.job_id }));
      return refreshPipelineJob(true);
    });
  }).catch(function(error) {
    setState({ pipelineSubmitting: false, pipelineError: error.message });
    showToast(t('app.pipeline.submitFail', { error: error.message }));
  });
}

function refreshPipelineJob(forceLog) {
  var s = getState();
  if (!s.pipelineJobId || !s.pipelineBaseUrl) return Promise.resolve();

  setState({ pipelineRefreshing: true });

  var logPromise;
  var pjStatus = s.pipelineJob ? s.pipelineJob.status : null;
  if (forceLog || (pjStatus !== 'completed' && pjStatus !== 'failed')) {
    logPromise = fetchPipelineLog(s.pipelineBaseUrl, s.pipelineJobId).catch(function() { return s.pipelineLog || ''; });
  } else {
    logPromise = Promise.resolve(s.pipelineLog || '');
  }

  return Promise.all([
    fetchPipelineJob(s.pipelineBaseUrl, s.pipelineJobId),
    logPromise,
  ]).then(function(results) {
    var job = results[0];
    var log = results[1];
    setState({
      pipelineRefreshing: false,
      pipelineJob: job,
      pipelineLog: typeof log === 'string' ? log : s.pipelineLog,
      pipelineError: null,
    });
  }).catch(function(error) {
    setState({ pipelineRefreshing: false, pipelineError: error.message });
  });
}

function schedulePolling() {
  var s = getState();
  var status = s.pipelineJob ? s.pipelineJob.status : null;
  var shouldPoll = s.pipelineJobId && (status === 'queued' || status === 'processing');

  if (!shouldPoll) {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    return;
  }

  if (pollTimer) return;

  pollTimer = setTimeout(function() {
    pollTimer = null;
    refreshPipelineJob().then(function() {
      schedulePolling();
    });
  }, 3000);
}
