import { validateModsAgainstAPK } from './apk-parser.js';

export function buildRebuildHandoffBundle(options) {
  var apk = options.apk;
  var manifest = options.manifest;
  var mods = options.mods;

  var validation = validateModsAgainstAPK(mods, apk.allFiles, apk.editablePaths || []);
  if (validation.safeMods.length === 0 || validation.safeChangeCount === 0) {
    return Promise.reject(new Error('No validated packaged text changes are available for export.'));
  }
  if (validation.unsafeMods.length > 0) {
    return Promise.reject(new Error('Some selected modifications are blocked. Deselect blocked mods first.'));
  }

  var baseName = (apk.originalName || apk.name).replace(/\.(apk|xapk|apks|aab|zip)$/i, '');
  var jobZip = new window.JSZip();
  var pipeline = buildPipelineSteps(apk);
  var warnings = [
    'This export is not an installable APK.',
    'Use a real Android packaging environment or the paired backend pipeline to apply the replacement files and rebuild output artifacts.',
    'Original signing key continuity is required to update an already installed vendor-signed app.',
  ];
  var containerWarnings = (apk.containerDiagnostics && apk.containerDiagnostics.warnings) || [];
  for (var cw = 0; cw < containerWarnings.length; cw++) {
    warnings.push(containerWarnings[cw]);
  }

  var defaultTargetApk = apk.analysisTargetPath || null;
  var selectedFileChanges = [];
  for (var si = 0; si < validation.safeMods.length; si++) {
    var mod = validation.safeMods[si];
    var changes = mod.fileChanges || [];
    for (var ci = 0; ci < changes.length; ci++) {
      selectedFileChanges.push({
        modId: mod.id,
        modLabel: mod.label,
        path: changes[ci].path,
        content: changes[ci].content,
        targetApk: changes[ci].targetApk || defaultTargetApk,
      });
    }
  }

  var isSplit = apk.containerType === 'apks' || apk.containerType === 'split-apk' || apk.containerType === 'aab';
  var requiredOutputs = isSplit
    ? ['validated split-aware rebuild artifacts', 'bundletool-compatible install set', 'signed final package set']
    : ['rebuilt APK', 'zipaligned APK', 'signed APK', 'verification log'];

  var manifestPkg = (manifest && manifest.package) || null;
  var manifestVer = (manifest && manifest.versionName) || null;

  var job = {
    exportedAt: new Date().toISOString(),
    appMode: 'analysis-and-rebuild-handoff',
    originalInput: {
      originalName: apk.originalName || apk.name,
      analyzedName: apk.name,
      containerType: apk.containerType || 'apk',
      analysisTargetPath: apk.analysisTargetPath || null,
      packageName: manifestPkg,
      versionName: manifestVer,
      fileCount: apk.allFiles.length,
      editablePathCount: (apk.editablePaths || []).length,
    },
    manifest: manifest || null,
    containerDiagnostics: apk.containerDiagnostics || null,
    warnings: warnings,
    pipeline: pipeline,
    selectedMods: (function() {
      var result = [];
      for (var sm = 0; sm < validation.safeMods.length; sm++) {
        var mod = validation.safeMods[sm];
        var modChanges = mod.fileChanges || [];
        var changes = [];
        for (var mc = 0; mc < modChanges.length; mc++) {
          changes.push({
            path: modChanges[mc].path,
            content: modChanges[mc].content,
            targetApk: modChanges[mc].targetApk || defaultTargetApk,
          });
        }
        result.push({
          id: mod.id,
          label: mod.label,
          description: mod.description,
          category: mod.category,
          fileChanges: changes,
        });
      }
      return result;
    })(),
    editablePaths: apk.editablePaths || [],
    requiredOutputs: requiredOutputs,
  };

  jobZip.file('rebuild-job.json', JSON.stringify(job, null, 2));
  jobZip.file('README.txt', buildReadme(job));
  jobZip.file('selected-file-replacements.json', JSON.stringify(selectedFileChanges, null, 2));
  jobZip.file('original/' + (apk.originalName || apk.name), apk.sourcePackageBytes || apk.originalBytes);

  for (var mi = 0; mi < validation.safeMods.length; mi++) {
    var safeMod = validation.safeMods[mi];
    var padIdx = String(mi + 1);
    while (padIdx.length < 2) padIdx = '0' + padIdx;
    var safeFolder = jobZip.folder('replacements/' + padIdx + '-' + sanitizeName(safeMod.label));
    var modChanges = safeMod.fileChanges || [];
    for (var mc = 0; mc < modChanges.length; mc++) {
      safeFolder.file(modChanges[mc].path, modChanges[mc].content);
    }
  }

  return jobZip.generateAsync({ type: 'uint8array' }).then(function(bundleBytes) {
    return {
      bundleBytes: bundleBytes,
      fileName: baseName + '_rebuild_job.zip',
      validation: validation,
      report: {
        packageName: manifestPkg,
        selectedMods: validation.safeMods.length,
        selectedFiles: validation.safeChangeCount,
        warnings: warnings,
        pipeline: pipeline,
      },
    };
  });
}

export function saveBundleBytes(bytes, filename) {
  var blob = new Blob([bytes], { type: 'application/zip' });
  var url = URL.createObjectURL(blob);
  var anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
}

function buildPipelineSteps(apk) {
  var splitLike = ['apks', 'split-apk', 'aab', 'xapk'].indexOf(apk.containerType) >= 0;
  var steps = [
    'Unpack the original input in a real Android packaging environment.',
    'Apply only the validated replacement files from this export to the matching package paths.',
  ];

  if (splitLike) {
    steps.push('Rebuild the package set with bundletool-aware handling for base and split artifacts.');
  } else {
    steps.push('Rebuild the APK with apktool or an equivalent AAPT2-based workflow.');
  }

  steps.push('Run zipalign on the rebuilt APK artifact before final signing.');
  steps.push('Sign the final artifact with apksigner or an equivalent apksig-based pipeline.');
  steps.push('If replacing an already installed vendor-signed app, use the original signing key or expect update installation to fail.');
  steps.push('Run verification on the final artifact or artifact set before distribution.');
  return steps;
}

function buildReadme(job) {
  var lines = [
    'APK Rebuild Handoff Bundle',
    '==========================',
    '',
    'This export is NOT an installable APK.',
    'It is a validated handoff package for a real Android rebuild pipeline.',
    '',
    'Original input: ' + job.originalInput.originalName,
    'Container type: ' + job.originalInput.containerType,
    'Analysis target: ' + (job.originalInput.analysisTargetPath || 'self'),
    'Package name: ' + (job.originalInput.packageName || 'unknown'),
    'Selected modifications: ' + job.selectedMods.length,
    '',
    'Included files:',
    '- rebuild-job.json: full machine-readable handoff payload',
    '- selected-file-replacements.json: flattened replacement file list',
    '- original/: original uploaded package bytes',
    '- replacements/: per-mod replacement file payloads',
    '',
    'Required external pipeline steps:',
  ];
  for (var i = 0; i < job.pipeline.length; i++) {
    lines.push((i + 1) + '. ' + job.pipeline[i]);
  }
  lines.push('');
  lines.push('Warnings:');
  for (var w = 0; w < job.warnings.length; w++) {
    lines.push('- ' + job.warnings[w]);
  }
  return lines.join('\n');
}

function sanitizeName(value) {
  return String(value || 'mod')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mod';
}
