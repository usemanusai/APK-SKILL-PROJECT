import { el, t } from '../dom.js';
import { assessManifestRisk } from '../apk-parser.js';

var BREAKDOWN_STYLES = {
  cyan: 'text-[10px] px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-semibold',
  emerald: 'text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 font-semibold',
  violet: 'text-[10px] px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/20 font-semibold',
  amber: 'text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-semibold',
  rose: 'text-[10px] px-2 py-1 rounded-full bg-rose-400/10 text-rose-300 border border-rose-400/20 font-semibold',
  slate: 'text-[10px] px-2 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10 font-semibold',
};

export function renderApkSummary(container, apk, manifest, onReset, buildState) {
  var infoCard = el('div', { className: 'rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4' });
  var sizeMB = (apk.size / 1048576).toFixed(1);
  var containerBadge = apk.containerType && apk.containerType !== 'apk'
    ? el('span', { className: 'text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-bold ml-2' }, apk.containerType.toUpperCase())
    : null;

  infoCard.appendChild(el('div', { className: 'flex items-center justify-between mb-2' },
    el('div', { className: 'flex items-center gap-2' },
      el('span', { className: 'text-2xl', html: '&#128230;' }),
      el('div', {},
        el('p', { className: 'text-sm font-bold text-white truncate max-w-[200px] flex items-center' },
          apk.originalName || apk.name,
          containerBadge,
        ),
        el('p', { className: 'text-xs text-slate-500' }, sizeMB + ' MB'),
      ),
    ),
    el('button', {
      className: 'text-xs text-slate-500 hover:text-rose-400 transition-colors',
      onClick: onReset,
      'aria-label': t('app.apk.remove'),
    }, '\u00D7 ' + t('app.apk.remove')),
  ));

  if (manifest) {
    infoCard.appendChild(el('div', { className: 'mt-2 grid grid-cols-2 gap-2 text-xs' },
      metricCard(t('app.apk.package'), manifest.package, 'text-cyan-300 font-mono mt-0.5 truncate'),
      manifest.versionName ? metricCard(t('app.apk.version'), manifest.versionName, 'text-white font-mono mt-0.5') : null,
      metricCard(t('app.apk.permissions'), String(manifest.permissions.length), 'text-amber-300 font-mono mt-0.5'),
      metricCard(t('app.apk.smaliFiles'), String(apk.categories.smali.length), 'text-emerald-300 font-mono mt-0.5'),
      el('div', { className: 'rounded-lg bg-white/[0.03] px-3 py-2 col-span-2' },
        el('span', { className: 'text-slate-500' }, t('app.apk.editableTextFiles')),
        el('p', { className: 'text-cyan-300 font-mono mt-0.5' }, String((apk.editablePaths || []).length)),
      ),
    ));
    infoCard.appendChild(renderManifestRiskBadge(manifest));
  }

  var breakdown = el('div', { className: 'flex flex-wrap gap-1.5 mt-3' });
  var breakdownItems = [
    { key: 'smali', label: t('app.apk.smaliCode'), color: 'cyan' },
    { key: 'resources', label: t('app.apk.resources'), color: 'emerald' },
    { key: 'assets', label: t('app.apk.browser.assets'), color: 'violet' },
    { key: 'libs', label: t('app.apk.nativeLibs'), color: 'amber' },
    { key: 'dex', label: t('app.apk.dexFiles'), color: 'rose' },
    { key: 'meta', label: t('app.apk.browser.meta'), color: 'slate' },
  ];
  for (var bi = 0; bi < breakdownItems.length; bi++) {
    (function(item) {
      var catList = apk.categories[item.key];
      if (catList && catList.length > 0) {
        breakdown.appendChild(el('span', {
          className: BREAKDOWN_STYLES[item.color],
        }, item.label + ': ' + catList.length));
      }
    })(breakdownItems[bi]);
  }
  infoCard.appendChild(breakdown);

  var hasPerms = manifest && manifest.permissions && manifest.permissions.length;
  if (hasPerms) {
    var perms = el('div', { className: 'flex flex-wrap gap-1 mt-3' });
    var permsToShow = manifest.permissions.slice(0, 8);
    for (var pi = 0; pi < permsToShow.length; pi++) {
      (function(perm) {
        var short = perm.replace('android.permission.', '');
        var dangerWords = ['CAMERA', 'READ_CONTACTS', 'READ_PHONE_STATE', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'];
        var isDanger = false;
        for (var di = 0; di < dangerWords.length; di++) {
          if (short.indexOf(dangerWords[di]) >= 0) { isDanger = true; break; }
        }
        var cls = isDanger
          ? 'text-[10px] px-2 py-0.5 rounded-full bg-rose-400/10 text-rose-300 border border-rose-400/20'
          : 'text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10';
        perms.appendChild(el('span', { className: cls }, short));
      })(permsToShow[pi]);
    }
    if (manifest.permissions.length > 8) {
      perms.appendChild(el('span', { className: 'text-[10px] text-slate-500 self-center' }, t('app.apk.permissionsMore', { count: manifest.permissions.length - 8 })));
    }
    infoCard.appendChild(perms);
  }

  container.appendChild(infoCard);
  renderRebuildBoundaries(container, apk, manifest);
  renderBuildStatus(container, buildState);
}

var RISK_BADGE_STYLES = {
  low: 'text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 font-semibold',
  medium: 'text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-semibold',
  high: 'text-[10px] px-2 py-1 rounded-full bg-rose-400/10 text-rose-300 border border-rose-400/20 font-semibold',
};

function renderManifestRiskBadge(manifest) {
  var risk = assessManifestRisk(manifest);
  var wrap = el('div', { className: 'mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs' });
  var expanded = false;
  var findingsList = el('ul', { className: 'mt-2 space-y-1 hidden' });

  for (var fi = 0; fi < risk.findings.length; fi++) {
    (function(finding) {
      findingsList.appendChild(el('li', { className: 'text-[11px] text-slate-400 leading-relaxed flex gap-2' },
        el('span', { className: 'mt-0.5 text-slate-500' }, '\u2022'),
        el('span', {}, finding.label + (finding.detail ? ' \u2014 ' + finding.detail : '')),
      ));
    })(risk.findings[fi]);
  }

  var toggleBtn = el('button', {
    className: 'text-[10px] text-slate-500 hover:text-slate-300 transition-colors ml-2',
    onClick: function() {
      expanded = !expanded;
      findingsList.classList.toggle('hidden', !expanded);
      toggleBtn.textContent = expanded ? '\u25B2' : '\u25BC';
    },
  }, '\u25BC');

  var header = el('div', { className: 'flex items-center justify-between' },
    el('span', { className: 'text-slate-500' }, 'Manifest risk'),
    el('div', { className: 'flex items-center' },
      el('span', { className: RISK_BADGE_STYLES[risk.level] || RISK_BADGE_STYLES.low }, risk.level.toUpperCase() + ' \u00B7 ' + risk.findings.length),
      risk.findings.length ? toggleBtn : null,
    ),
  );

  wrap.appendChild(header);
  if (risk.findings.length) wrap.appendChild(findingsList);
  return wrap;
}

function metricCard(label, value, valueClass) {
  return el('div', { className: 'rounded-lg bg-white/[0.03] px-3 py-2' },
    el('span', { className: 'text-slate-500' }, label),
    el('p', { className: valueClass }, value),
  );
}

function renderRebuildBoundaries(container, apk, manifest) {
  var warnings = [
    t('app.apk.boundaries.warning1'),
    t('app.apk.boundaries.warning2'),
    t('app.apk.boundaries.warning3'),
    t('app.apk.boundaries.warning4'),
  ];

  var diag = apk.containerDiagnostics;
  var diagWarnings = diag && diag.warnings;
  if (diagWarnings) {
    for (var dw = 0; dw < diagWarnings.length; dw++) {
      warnings.push(diagWarnings[dw]);
    }
  }

  var metrics = [];
  if (diag && diag.apkEntryCount > 1) metrics.push(t('app.apk.boundaries.apkParts', { count: diag.apkEntryCount }));
  if (diag && diag.splitCount > 0) metrics.push(t('app.apk.boundaries.splitParts', { count: diag.splitCount }));
  if (diag && diag.obbCount > 0) metrics.push(t('app.apk.boundaries.obbFiles', { count: diag.obbCount }));
  if (manifest && manifest.package) metrics.push(t('app.apk.boundaries.packageMetric', { 'package': manifest.package }));

  var card = el('div', { className: 'mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3' });
  card.appendChild(el('div', { className: 'flex items-center gap-2 mb-2' },
    el('span', { className: 'text-sm', html: '&#9888;&#65039;' }),
    el('span', { className: 'text-sm font-bold text-amber-200' }, t('app.apk.boundaries.title')),
  ));

  if (metrics.length > 0) {
    card.appendChild(el('p', { className: 'text-[11px] text-amber-100/90 mb-2 leading-relaxed' }, metrics.join(' \u2022 ')));
  }

  var list = el('ul', { className: 'space-y-1.5' });
  for (var wi = 0; wi < warnings.length; wi++) {
    (function(warning) {
      list.appendChild(el('li', { className: 'text-xs text-amber-100/90 leading-relaxed flex gap-2' },
        el('span', { className: 'mt-0.5 text-amber-300' }, '\u2022'),
        el('span', {}, warning),
      ));
    })(warnings[wi]);
  }
  card.appendChild(list);
  container.appendChild(card);
}

function renderBuildStatus(container, state) {
  if (!state.apkBuildReport && !state.apkBuildError) return;

  if (state.apkBuildError) {
    container.appendChild(el('div', { className: 'mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3' },
      el('div', { className: 'flex items-center gap-2 mb-1' },
        el('span', { className: 'text-sm', html: '&#10060;' }),
        el('span', { className: 'text-sm font-bold text-rose-200' }, t('app.apk.exportFailedTitle')),
      ),
      el('p', { className: 'text-xs text-rose-100/90 leading-relaxed' }, state.apkBuildError),
    ));
    return;
  }

  var report = state.apkBuildReport;
  var checks = [];
  if (report.packageName) checks.push(t('app.apk.boundaries.packageMetric', { 'package': report.packageName }));
  if (report.selectedMods >= 0) checks.push(t('app.apk.exportModCount', { count: report.selectedMods }));
  if (report.selectedFiles >= 0) checks.push(t('app.apk.exportFileCount', { count: report.selectedFiles }));
  var pipeLen = report.pipeline && report.pipeline.length;
  if (pipeLen) checks.push(t('app.apk.exportStepCount', { count: pipeLen }));

  var repWarnings = report.warnings;
  var hasWarnings = Boolean(repWarnings && repWarnings.length);
  var borderCls = hasWarnings ? 'border-amber-400/25 bg-amber-400/[0.05]' : 'border-emerald-400/25 bg-emerald-400/[0.05]';
  var card = el('div', { className: 'mb-4 rounded-2xl border px-4 py-3 ' + borderCls });
  card.appendChild(el('div', { className: 'flex items-center gap-2 mb-1' },
    el('span', { className: 'text-sm', html: hasWarnings ? '&#9888;&#65039;' : '&#9989;' }),
    el('span', { className: 'text-sm font-bold ' + (hasWarnings ? 'text-amber-200' : 'text-emerald-200') }, hasWarnings ? t('app.apk.exportWarningTitle') : t('app.apk.exportSuccessTitle')),
  ));
  card.appendChild(el('p', { className: 'text-xs leading-relaxed ' + (hasWarnings ? 'text-amber-100/90' : 'text-emerald-100/90') }, t('app.apk.exportStatusBody')));

  if (checks.length > 0) {
    card.appendChild(el('p', { className: 'text-[11px] text-slate-300 mt-2' }, checks.join(' \u2022 ')));
  }

  if (hasWarnings) {
    var list = el('ul', { className: 'mt-2 space-y-1' });
    for (var i = 0; i < repWarnings.length; i++) {
      (function(warning) {
        list.appendChild(el('li', { className: 'text-[11px] text-amber-100/90 flex gap-2 leading-relaxed' },
          el('span', { className: 'mt-0.5 text-amber-300' }, '\u2022'),
          el('span', {}, warning),
        ));
      })(repWarnings[i]);
    }
    card.appendChild(list);
  }

  container.appendChild(card);
}
