// ui/apk-tab/actions.js - APK action handlers (ES5, no async/await)
import { getState, setState } from '../../state.js';
import { showToast, t } from '../dom.js';
import {
  extractAPK,
  analyzeManifest,
  readKeyFiles,
  validateModsAgainstAPK,
} from '../apk-parser.js';
import { runAutonomousWorkflow } from '../apk-workflow.js';
import { buildRebuildHandoffBundle, saveBundleBytes } from '../rebuild-handoff.js';
import { getApkResetPatch } from './helpers.js';

export function handleAPKFile(file) {
  var resetPatch = getApkResetPatch();
  resetPatch.apkState = 'loading';
  setState(resetPatch);

  return extractAPK(file).then(function(result) {
    var zip = result.zip;
    var allFiles = result.allFiles;
    var categories = result.categories;
    var containerType = result.containerType;
    var containerDiagnostics = result.containerDiagnostics;
    var fileName = result.fileName;
    var originalBytes = result.originalBytes;
    var sourcePackageBytes = result.sourcePackageBytes;
    var analysisTargetPath = result.analysisTargetPath;
    var editablePaths = result.editablePaths;

    return analyzeManifest(zip).then(function(manifest) {
      return readKeyFiles(zip, categories, editablePaths).then(function(keyFiles) {
        setState({
          apkState: 'loaded',
          apkFile: {
            name: fileName,
            size: file.size,
            zip: zip,
            allFiles: allFiles,
            categories: categories,
            containerType: containerType,
            containerDiagnostics: containerDiagnostics,
            originalName: file.name,
            originalBytes: originalBytes,
            sourcePackageBytes: sourcePackageBytes,
            analysisTargetPath: analysisTargetPath,
            editablePaths: editablePaths,
          },
          apkManifest: manifest,
          apkCategories: categories,
          apkKeyFiles: keyFiles,
        });

        var toastParts = [
          t('app.apk.loaded', { count: allFiles.length }),
          t('app.apk.editableCount', { count: editablePaths.length }),
        ];
        if (containerType !== 'apk') {
          toastParts.push(t('app.apk.containerLoadedShort', { type: containerType.toUpperCase() }));
        }
        showToast(toastParts.join(' \u2022 '));
      });
    });
  })['catch'](function(error) {
    console.error('APK extraction error:', error);
    setState({
      apkState: 'error',
      apkError: t('app.apk.readFailed', { error: error.message || t('app.apk.unknownError') }),
    });
  });
}

export function runApkAnalysis() {
  var s = getState();
  var apk = s.apkFile;
  var modelId = s.aiModelId || s.selectedModelId;

  if (!apk) return;

  setState({
    apkState: 'analyzing',
    apkError: null,
    apkCancelRequested: false,
    // Keep existing mods visible during re-analysis — do NOT clear apkMods or apkAppliedMods
    apkAttempt: 0,
    apkMaxAttempts: 3,
    apkProgressMsg: t('app.apk.progressStarting'),
    apkDiscoveredMods: [],
  });

  runAutonomousWorkflow(
    apk.zip,
    apk.allFiles,
    apk.categories,
    s.apkManifest,
    s.apkKeyFiles,
    modelId,
    function(progress) {
      var patch = {
        apkAttempt: progress.attempt,
        apkMaxAttempts: progress.maxAttempts,
        apkProgressMsg: progress.message,
      };
      if (progress.newMods && progress.newMods.length > 0) {
        patch.apkDiscoveredMods = (getState().apkDiscoveredMods || []).concat(progress.newMods);
      }
      setState(patch);
      var progressEl = document.getElementById('apk-progress-text');
      if (progressEl) progressEl.textContent = progress.message;
    },
    apk.editablePaths || []
  ).then(function(newMods) {
    // Merge new mods with existing ones — preserve existing selections
    var existingMods = s.apkMods || [];
    var existingApplied = s.apkAppliedMods || [];
    var seen = {};
    var merged = [];

    // Add existing mods first (preserve order & selections)
    for (var ei = 0; ei < existingMods.length; ei++) {
      var em = existingMods[ei];
      var eKey = em.label.toLowerCase() + '|' + (em.targetFile || '').toLowerCase();
      seen[eKey] = true;
      merged.push(em);
    }

    // Add new mods that aren't duplicates of existing ones
    var newCount = 0;
    for (var ni = 0; ni < newMods.length; ni++) {
      var nm = newMods[ni];
      var nKey = nm.label.toLowerCase() + '|' + (nm.targetFile || '').toLowerCase();
      if (!seen[nKey]) {
        seen[nKey] = true;
        merged.push(nm);
        newCount++;
      }
    }

    setState({
      apkState: 'complete',
      apkMods: merged,
      // Preserve existing selections — do NOT clear apkAppliedMods
      apkAnalysisError: null,
    });
    showToast(t('app.apk.generatedToast', { count: newCount }) +
      (existingMods.length > 0 ? ' (' + merged.length + ' total)' : ''));
  })['catch'](function(error) {
    if (error && error.cancelled) {
      var existingModsOnCancel = s.apkMods || [];
      setState({
        apkState: existingModsOnCancel.length > 0 ? 'complete' : 'loaded',
        apkCancelRequested: false,
        apkAttempt: 0,
        apkMaxAttempts: 3,
        apkProgressMsg: '',
      });
      showToast('Analysis cancelled.');
      return;
    }
    console.error('APK analysis error:', error);
    var safeMsg = '';
    try {
      safeMsg = (error && error.message) ? error.message : t('app.apk.unknownError');
    } catch (e) {
      safeMsg = 'Analysis failed';
    }
    // If re-analysis fails but existing mods exist, keep them visible in 'complete' state
    var existingMods = s.apkMods || [];
    setState({
      apkState: existingMods.length > 0 ? 'complete' : 'loaded',
      apkAnalysisError: t('app.apk.errors.generic', { error: safeMsg }),
    });
  });
}

export function toggleCategory(catMods, select) {
  var currentApplied = getState().apkAppliedMods || [];
  var current = {};
  for (var ci = 0; ci < currentApplied.length; ci++) {
    current[currentApplied[ci]] = true;
  }
  for (var i = 0; i < catMods.length; i++) {
    if (select) { current[catMods[i].id] = true; }
    else { delete current[catMods[i].id]; }
  }
  var result = [];
  var keys = Object.keys(current);
  for (var k = 0; k < keys.length; k++) {
    result.push(keys[k]);
  }
  setState({ apkAppliedMods: result });
}

export function exportRebuildJob() {
  var s = getState();
  var apk = s.apkFile;
  var appliedIds = s.apkAppliedMods || [];
  var allMods = s.apkMods || [];
  var selectedMods = [];
  for (var fi = 0; fi < allMods.length; fi++) {
    if (appliedIds.indexOf(allMods[fi].id) >= 0) {
      selectedMods.push(allMods[fi]);
    }
  }

  if (!apk || selectedMods.length === 0) {
    showToast(t('app.apk.selectFirst'));
    return;
  }

  var validation = validateModsAgainstAPK(selectedMods, apk.allFiles, apk.editablePaths || []);
  if (validation.unsafeMods.length > 0) {
    showToast(t('app.apk.exportBlocked'));
    return;
  }

  var confirmationLines = [
    t('app.apk.confirmExportTitle'),
    t('app.apk.confirmExportLine1'),
    t('app.apk.confirmExportLine2'),
    t('app.apk.confirmExportLine3'),
    t('app.apk.confirmExportLine4'),
  ];
  var diag = apk.containerDiagnostics;
  var diagWarnings = diag && diag.warnings;
  if (diagWarnings) {
    for (var ci = 0; ci < diagWarnings.length; ci++) {
      confirmationLines.push('\u2022 ' + diagWarnings[ci]);
    }
  }

  if (!window.confirm(confirmationLines.join('\n'))) {
    return;
  }

  setState({ apkBuildReport: null, apkBuildError: null });
  showToast(t('app.apk.exportPreparing'));

  buildRebuildHandoffBundle({
    apk: apk,
    manifest: s.apkManifest,
    mods: selectedMods,
  }).then(function(handoff) {
    saveBundleBytes(handoff.bundleBytes, handoff.fileName);

    setState({
      apkBuildReport: handoff.report,
      apkBuildError: null,
    });

    showToast(t('app.apk.downloaded', { name: handoff.fileName, count: handoff.validation.safeChangeCount }));
  })['catch'](function(error) {
    console.error('Export error:', error);
    var message = '';
    try {
      message = error.message || t('app.apk.unknownError');
    } catch (e) {
      message = 'Export failed';
    }
    setState({
      apkBuildReport: null,
      apkBuildError: message,
    });
    showToast(t('app.apk.exportFailedToast', { error: message }));
  });
}
