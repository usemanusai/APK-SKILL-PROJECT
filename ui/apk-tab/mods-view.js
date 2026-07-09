import { getState, setState } from '../../state.js';
import { el, t, showToast } from '../dom.js';
import { AI_CATEGORIES, MOD_SIDES, MOD_DIFFICULTY } from '../ai-analysis.js';
import { validateModsAgainstAPK } from '../apk-parser.js';
import { generateSkillMd, getSkillMdFilename, downloadSkillMd, generateMobileTutorialSkillMd, getMobileSkillMdFilename, downloadMobileSkillMd, runSkillMdGenerationWorkflow } from '../skill-md/generator.js';

var EXPANDED_MODS_KEY = 'apkExpandedMods';

function getExpandedMods() {
  return new Set(getState().apkExpandedMods || []);
}

function toggleModExpanded(modId) {
  var expanded = getExpandedMods();
  if (expanded.has(modId)) expanded['delete'](modId);
  else expanded.add(modId);
  setState({ apkExpandedMods: Array.from(expanded) });
}

export function renderApkMods(container, onToggleCategory, onExport) {
  var s = getState();
  var validation = validateModsAgainstAPK(s.apkMods, s.apkFile.allFiles, s.apkFile.editablePaths || []);
  var safeIds = new Set(validation.safeMods.map(function(mod) { return mod.id; }));
  var unsafeMap = new Map(validation.unsafeMods.map(function(mod) { return [mod.id, mod]; }));
  var applied = new Set((s.apkAppliedMods || []).filter(function(id) { return safeIds.has(id); }));

  // Header bar
  var header = el('div', { className: 'flex items-center justify-between mb-2 flex-wrap gap-2' });
  var left = el('div', { className: 'flex items-center gap-2 flex-wrap' },
    el('span', { className: 'text-sm font-bold text-white', html: '&#9889; ' }),
    el('span', { className: 'text-sm font-bold text-white' }, t('app.apk.generatedMods', { count: s.apkMods.length })),
    el('span', { className: 'text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 font-semibold' }, t('app.apk.installSafeCount', { count: validation.safeMods.length })),
    validation.unsafeMods.length > 0
      ? el('span', { className: 'text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-semibold' }, t('app.apk.blockedCount', { count: validation.unsafeMods.length }))
      : null,
  );

  left.appendChild(el('div', { className: 'flex gap-1.5' },
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors font-semibold',
      onClick: function() { setState({ apkAppliedMods: validation.safeMods.map(function(mod) { return mod.id; }) }); },
      disabled: validation.safeMods.length === 0,
    }, t('app.apk.selectSafe')),
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors font-semibold',
      onClick: function() { setState({ apkAppliedMods: [] }); },
    }, t('app.apk.deselectAll')),
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-cyan-300 border border-cyan-400/20 hover:bg-cyan-400/10 hover:border-cyan-400/40 transition-colors font-semibold flex items-center gap-1',
      onClick: function(e) { copyAllRawText(s.apkMods, s.apkFile, s.apkManifest, e.target); },
      disabled: s.apkMods.length === 0,
    },
      el('span', { html: '&#128203;' }),
      'Raw Copy',
    ),
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-emerald-300 border border-emerald-400/20 hover:bg-emerald-400/10 hover:border-emerald-400/40 transition-colors font-semibold flex items-center gap-1',
      onClick: function() { exportAsMarkdown(s.apkMods, s.apkFile, s.apkManifest); },
      disabled: s.apkMods.length === 0,
    },
      el('span', { html: '&#128221;' }),
      'Export .md',
    ),
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:from-violet-500/30 hover:to-cyan-500/30 hover:border-cyan-400/50 transition-colors font-semibold flex items-center gap-1',
      onClick: function() { exportSkillMd('mcp'); },
      disabled: applied.size === 0 || (s.apkState === 'skillmd-generating'),
    },
      el('span', { html: '&#129302;' }),
      (s.apkState === 'skillmd-generating' && s.skillMdMode === 'mcp') ? 'Generating MCP...' : t('app.apk.skillMdMcp'),
    ),
    el('button', {
      className: 'text-[10px] px-2.5 py-1 rounded-lg bg-gradient-to-r from-pink-500/20 to-amber-500/20 text-amber-200 border border-amber-400/30 hover:from-pink-500/30 hover:to-amber-500/30 hover:border-amber-400/50 transition-colors font-semibold flex items-center gap-1',
      onClick: function() { exportSkillMd('mobile'); },
      disabled: applied.size === 0 || (s.apkState === 'skillmd-generating'),
    },
      el('span', { html: '&#128241;' }),
      (s.apkState === 'skillmd-generating' && s.skillMdMode === 'mobile') ? 'Generating Mobile...' : t('app.apk.skillMdMobile'),
    ),
  ));

  header.appendChild(left);
  header.appendChild(el('button', {
    className: 'text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 text-slate-950 font-bold transition hover:from-cyan-300 hover:to-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5',
    onClick: onExport,
    disabled: applied.size === 0,
  },
    el('span', { html: '&#11015;' }),
    t('app.apk.downloadModded'),
  ));
  container.appendChild(header);

  // Live autonomous SKILL.md generation progress banner
  var s2 = getState();
  var isGenerating = (s2.apkState === 'skillmd-generating') || s2.skillMdGenerating || (s2.apkProgressMsg && s2.apkProgressMsg.toLowerCase().includes('skill.md'));
  if (isGenerating) {
    var genBanner = el('div', {
      className: 'mb-4 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4'
    });

    genBanner.appendChild(el('div', { className: 'flex items-center gap-2 mb-2' },
      el('span', { className: 'text-lg', html: '&#129302;' }),
      el('span', { className: 'font-bold text-amber-200' }, 'Autonomous SKILL.md Generation (' + (s2.skillMdMode || 'mcp').toUpperCase() + ')'),
    ));

    genBanner.appendChild(el('div', {
      className: 'text-sm text-amber-200 animate-pulse',
      id: 'skillmd-progress-text'
    }, s2.apkProgressMsg || 'Agents are writing ultra-detailed phone-executable instructions...'));

    genBanner.appendChild(el('p', {
      className: 'text-[10px] text-amber-300/70 mt-2'
    }, 'This uses the same multi-agent orchestration as \"Analyze APK\". Each step is written with extreme precision for execution on an Android phone using android-mcp + apk-mcp tools. Can take 5–25+ minutes.'));

    container.appendChild(genBanner);
  }

  // Persistent "Download SKILL.md" button when generation finished
  if (s2.skillMdResult && s2.skillMdResult.content && s2.skillMdResult.filename) {
    var res = s2.skillMdResult;
    var hasEdits = !!s2.skillMdEditedContent;
    var targetUsed = s2.skillMdTargetCount || 3;
    var doneBanner = el('div', {
      className: 'mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4'
    });
    doneBanner.appendChild(el('div', { className: 'flex items-center gap-2 mb-2' },
      el('span', { className: 'text-lg' }, '✅'),
      el('span', { className: 'font-bold text-emerald-200' }, 'SKILL.md ready (' + (res.mode || 'mcp').toUpperCase() + ')'),
      hasEdits ? el('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' }, 'EDITED') : null,
      el('span', { className: 'text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30' }, targetUsed + '/18 mods'),
    ));

    // Download the CURRENT version (edited if present, otherwise original)
    var currentContent = s2.skillMdEditedContent || res.content;
    doneBanner.appendChild(el('button', {
      className: 'mt-1 px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 text-sm',
      onClick: function() {
        try {
          var blob = new Blob([currentContent], { type: 'text/markdown;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = res.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
        } catch (e) { console.error(e); }
      }
    }, '⬇ Download ' + res.filename + (hasEdits ? ' (edited)' : '')));

    // NEW: Button to open inline editor
    doneBanner.appendChild(el('button', {
      className: 'ml-2 px-3 py-2 rounded-xl border border-emerald-300/50 text-emerald-200 text-sm font-semibold',
      onClick: function() { showSkillMdEditor(container); }
    }, t('app.apk.skillEditor.openEditor') || 'Open Editor'));

    container.appendChild(doneBanner);
  }

  // Summary bar
  var summaryBar = el('div', {
    className: 'flex items-center gap-3 mb-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-xs flex-wrap',
  });
  var targetForSummary = Math.min(18, Math.max(1, s.skillMdTargetCount || 3));
  summaryBar.appendChild(el('span', { className: 'text-slate-400' }, t('app.apk.modSelection', { selected: applied.size, total: validation.safeMods.length })));
  summaryBar.appendChild(el('span', { className: 'text-cyan-300 font-semibold' }, ' • Target: ' + targetForSummary + '/18'));
  summaryBar.appendChild(el('span', { className: 'text-slate-500' }, t('app.apk.safeTotal', { safe: validation.safeMods.length, total: s.apkMods.length })));
  var pct = validation.safeMods.length > 0 ? (applied.size / validation.safeMods.length) * 100 : 0;
  var progressBar = el('div', { className: 'flex-1 min-w-[120px] h-1.5 rounded-full bg-white/5 overflow-hidden' });
  progressBar.appendChild(el('div', {
    className: 'h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-300',
    style: 'width: ' + pct + '%',
  }));
  summaryBar.appendChild(progressBar);
  container.appendChild(summaryBar);

  // ── Target count selector for SKILL.md (default 3, max 18, user can increase + re-generate) ──
  var targetCount = Math.min(18, Math.max(1, s.skillMdTargetCount || 3));
  var targetSection = el('div', {
    className: 'mb-4 p-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03]'
  });

  targetSection.appendChild(el('div', {
    className: 'flex items-center justify-between mb-2'
  },
    el('span', { className: 'text-xs font-semibold uppercase tracking-widest text-cyan-300' }, 'SKILL.md Target Mods'),
    el('span', { className: 'font-mono text-sm font-bold text-cyan-200' }, targetCount + ' / 18')
  ));

  var presetRow = el('div', { className: 'flex flex-wrap gap-1.5' });
  var presets = [3, 6, 9, 12, 15, 18];
  presets.forEach(function(n) {
    var isActive = n === targetCount;
    presetRow.appendChild(el('button', {
      className: isActive
        ? 'px-3 py-1 text-xs font-bold rounded-lg bg-cyan-400 text-slate-950 transition'
        : 'px-3 py-1 text-xs rounded-lg bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition',
      onClick: function() {
        var newT = n;
        var curr = getState();
        var safeList = validation.safeMods || [];
        var currApplied = new Set(curr.apkAppliedMods || []);
        // Auto-fill up to the new target by adding more safe mods (preserves user choices)
        if (currApplied.size < newT && safeList.length > 0) {
          var toAdd = newT - currApplied.size;
          for (var si = 0; si < safeList.length && toAdd > 0; si++) {
            var sid = safeList[si].id;
            if (!currApplied.has(sid)) {
              currApplied.add(sid);
              toAdd--;
            }
          }
          setState({ skillMdTargetCount: newT, apkAppliedMods: Array.from(currApplied) });
        } else {
          setState({ skillMdTargetCount: newT });
        }
      }
    }, String(n)));
  });
  targetSection.appendChild(presetRow);

  targetSection.appendChild(el('p', {
    className: 'text-[10px] text-slate-400 mt-2 leading-relaxed'
  }, 'Starts at 3. Click a higher number → it auto-selects more safe mods. Select extra mods manually if you want. Then re-generate SKILL.md (repeat until you reach 18). Only the first N selected will be documented.'));

  container.appendChild(targetSection);

  // NEW: SKILL.md pre-generation options panel with toggles
  var opts = s.skillMdOptions || {};
  var optionsPanel = el('div', {
    className: 'mb-4 p-3 rounded-xl border border-white/10 bg-white/[0.015]'
  });

  optionsPanel.appendChild(el('div', {
    className: 'flex items-center justify-between mb-2'
  },
    el('span', { className: 'text-xs font-semibold uppercase tracking-widest text-slate-400' }, 'SKILL.md Content Options'),
    el('span', { className: 'text-[10px] text-slate-500' }, 'Pre-select what to include / exclude')
  ));

  var toggleRow = el('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs' });

  var makeToggle = function(key, label, desc) {
    var isOn = opts[key] !== false; // defaults to true
    var labelEl = el('label', {
      className: 'flex items-center gap-1.5 cursor-pointer select-none py-0.5'
    },
      el('input', {
        type: 'checkbox',
        checked: isOn,
        className: 'w-3.5 h-3.5 accent-cyan-400',
        onChange: function(e) {
          var current = Object.assign({}, getState().skillMdOptions || {});
          current[key] = e.target.checked;
          setState({ skillMdOptions: current });
        }
      }),
      el('span', { className: 'text-slate-300' }, label),
      desc ? el('span', { className: 'text-[10px] text-slate-500 ml-1' }, desc) : null
    );
    return labelEl;
  };

  toggleRow.appendChild(makeToggle('includeSetup', 'MCP Setup (Steps 1-3)', ''));
  toggleRow.appendChild(makeToggle('includePerMod', 'Per-Mod Detailed Steps', ''));
  toggleRow.appendChild(makeToggle('includeFullFiles', 'Full Replacement Files', ''));
  toggleRow.appendChild(makeToggle('includeDiffs', 'Diffs', ''));
  toggleRow.appendChild(makeToggle('includeFrida', 'Frida Scripts', ''));
  toggleRow.appendChild(makeToggle('includeTroubleshooting', 'Troubleshooting Matrix', ''));
  toggleRow.appendChild(makeToggle('includeDynamicWaits', 'Dynamic Waits Table', ''));
  toggleRow.appendChild(makeToggle('includeWarnings', 'Warnings & Scope', ''));
  toggleRow.appendChild(makeToggle('includeInventory', 'File Inventory', ''));
  toggleRow.appendChild(makeToggle('mobileScreenshots', 'Mobile Screenshot Placeholders', ''));
  toggleRow.appendChild(makeToggle('includeValidation', 'Validation & Verification Steps', 'screenshots, post-edit checks, \"verify unlocked features\" etc.')); // NEW: allows turning off validation screenshots that assume things are already unlocked/modded. Default = on. Turn off to avoid \"screenshot all unlocked features\" when they aren't yet.

  optionsPanel.appendChild(toggleRow);
  container.appendChild(optionsPanel);

  // Group by category
  var grouped = {};
  for (var gi = 0; gi < s.apkMods.length; gi++) {
    var mod = s.apkMods[gi];
    var category = mod.category || 'features';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(mod);
  }

  var groupKeys = Object.keys(grouped);
  for (var gk = 0; gk < groupKeys.length; gk++) {
    (function(categoryId) {
      var categoryMods = grouped[categoryId];
      var categoryInfo = AI_CATEGORIES[categoryId] || AI_CATEGORIES.features;
      var categoryLabel = getCategoryLabel(categoryId, categoryInfo.name);
      var selectableMods = categoryMods.filter(function(m) { return safeIds.has(m.id); });
      var allSelected = selectableMods.length > 0 && selectableMods.every(function(m) { return applied.has(m.id); });

      var categoryHeader = el('div', { className: 'flex items-center gap-2 mt-3 mb-2' },
        el('span', { className: 'text-sm', html: categoryInfo.icon }),
        el('span', { className: 'text-xs font-semibold uppercase tracking-widest text-slate-400' }, categoryLabel),
        el('span', { className: 'text-xs text-slate-600' }, '(' + categoryMods.length + ')'),
        el('div', { className: 'h-px flex-1 bg-white/10' }),
      );

      var toggleCls = allSelected
        ? 'text-[10px] px-2 py-0.5 rounded-md border transition-colors font-semibold bg-cyan-400/10 text-cyan-300 border-cyan-400/20 hover:bg-cyan-400/20'
        : 'text-[10px] px-2 py-0.5 rounded-md border transition-colors font-semibold bg-white/5 text-slate-500 border-white/10 hover:text-white hover:border-white/20';

      categoryHeader.appendChild(el('button', {
        className: toggleCls,
        onClick: function(event) {
          event.stopPropagation();
          onToggleCategory(selectableMods, !allSelected);
        },
        disabled: selectableMods.length === 0,
      }, allSelected ? t('app.apk.categoryDeselectSafe') : t('app.apk.categorySelectSafe')));

      container.appendChild(categoryHeader);
      renderCategoryGrid(container, categoryMods, safeIds, unsafeMap, applied);
    })(groupKeys[gk]);
  }

  // Footer
  container.appendChild(el('div', {
    className: 'mt-4 rounded-xl bg-white/[0.02] border border-white/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap',
  },
    el('span', { className: 'text-xs text-slate-400' }, t('app.apk.exportFootnote')),
    el('button', {
      className: 'text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 text-slate-950 font-bold transition hover:from-cyan-300 hover:to-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5',
      onClick: onExport,
      disabled: applied.size === 0,
    },
      el('span', { html: '&#11015;' }),
      t('app.apk.downloadModded'),
    ),
  ));
}

function renderCategoryGrid(container, mods, safeIds, unsafeMap, applied) {
  var grid = el('div', { className: 'flex flex-col gap-2 mb-2' });
  var expanded = getExpandedMods();

  for (var mi = 0; mi < mods.length; mi++) {
    (function(mod) {
      var isSupported = safeIds.has(mod.id);
      var isChecked = applied.has(mod.id);
      var isExpanded = expanded.has(mod.id);
      var blockedInfo = unsafeMap.get(mod.id);
      var br = blockedInfo && blockedInfo.blockedReasons;
      var blockedReason = (br && br[0]) || t('app.apk.blockedReasonDefault');

      var cardCls = !isSupported
        ? 'rounded-xl border p-3 transition-all select-none bg-amber-500/5 border-amber-500/20 opacity-70 cursor-not-allowed'
        : isChecked
          ? 'rounded-xl border p-3 transition-all select-none bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.08)] cursor-pointer'
          : 'rounded-xl border p-3 transition-all select-none bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer';

      var card = el('div', { className: cardCls });

      // Row 1: checkbox + title + badges
      var row1 = el('div', { className: 'flex items-start gap-2.5' });

      var checkCls = !isSupported
        ? 'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 bg-transparent border-amber-400/30 text-amber-300 mt-0.5'
        : isChecked
          ? 'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 bg-cyan-400 border-cyan-400 text-slate-950 mt-0.5'
          : 'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 bg-transparent border-white/20 hover:border-white/40 mt-0.5';

      var checkHtml = !isSupported ? '!' : isChecked
        ? '<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"none\"><path d=\"M2 6L5 9L10 3\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>'
        : '';

      row1.appendChild(el('div', { className: checkCls, html: checkHtml }));

      var titleCol = el('div', { className: 'flex-1 min-w-0' });
      titleCol.appendChild(el('div', { className: 'text-sm font-semibold text-white leading-tight' }, mod.label));

      // Badges row
      var badgeRow = el('div', { className: 'flex items-center gap-1.5 mt-1 flex-wrap' });

      // ModSide
      var side = MOD_SIDES[mod.modSide] || MOD_SIDES.client;
      badgeRow.appendChild(el('span', {
        className: 'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ' +
          (side.color === 'cyan' ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20' :
           side.color === 'amber' ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20' :
           'bg-violet-400/10 text-violet-300 border border-violet-400/20'),
      }, side.label));

      // Difficulty
      var diff = MOD_DIFFICULTY[mod.difficulty] || MOD_DIFFICULTY.medium;
      badgeRow.appendChild(el('span', {
        className: 'text-[9px] px-1.5 py-0.5 rounded font-semibold ' +
          (diff.color === 'emerald' ? 'bg-emerald-400/10 text-emerald-300' :
           diff.color === 'amber' ? 'bg-amber-400/10 text-amber-300' :
           'bg-red-400/10 text-red-300'),
      }, diff.label));

      // Target file
      if (mod.targetFile) {
        badgeRow.appendChild(el('span', {
          className: 'text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-mono truncate max-w-[200px]',
          title: mod.targetFile,
        }, mod.targetFile));
      }

      // Install-safe / blocked
      badgeRow.appendChild(isSupported
        ? el('span', { className: 'text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/20' }, t('app.apk.installSafeLabel'))
        : el('span', { className: 'text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20' }, t('app.apk.blockedLabel')));

      titleCol.appendChild(badgeRow);
      row1.appendChild(titleCol);
      card.appendChild(row1);

      // Description
      card.appendChild(el('p', { className: 'text-xs text-slate-400 mt-2 leading-relaxed' }, mod.description));

      if (!isSupported) {
        card.appendChild(el('p', { className: 'text-[11px] text-amber-300/90 mt-2 leading-relaxed' }, blockedReason));
      }

      // Expand button
      if (mod.diff || mod.instructions || mod.fridaScript) {
        var expandBtn = el('button', {
          className: 'text-[10px] mt-2 px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors font-semibold flex items-center gap-1',
          onClick: function(e) { e.stopPropagation(); toggleModExpanded(mod.id); },
        });
        expandBtn.innerHTML = (isExpanded ? '&#9650;' : '&#9660;') + ' ' + (isExpanded ? 'Hide' : 'Show') + ' Diff & Instructions';
        card.appendChild(expandBtn);
      }

      // Expanded content
      if (isExpanded && (mod.diff || mod.instructions || mod.fridaScript)) {
        var expandedSection = el('div', { className: 'mt-3 space-y-3' });

        if (mod.instructions) {
          expandedSection.appendChild(el('div', { className: 'rounded-lg bg-white/[0.03] border border-white/5 p-3' },
            el('div', { className: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5' }, '&#128203; Instructions'),
            el('pre', { className: 'text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono' }, mod.instructions),
          ));
        }

        if (mod.diff) {
          expandedSection.appendChild(renderDiffBlock(mod.diff, mod.targetFile));
        }

        if (mod.fridaScript && mod.fridaScript.length > 10) {
          var fridaBlock = el('div', { className: 'rounded-lg bg-violet-500/5 border border-violet-500/20 p-3' });
          fridaBlock.appendChild(el('div', { className: 'text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1.5' }, '&#129504; Frida Hook Script'));
          var fridaPre = el('pre', { className: 'text-xs text-violet-200 whitespace-pre-wrap leading-relaxed font-mono rounded-lg bg-black/30 p-3 mt-1 overflow-x-auto' });
          fridaPre.textContent = mod.fridaScript;
          fridaBlock.appendChild(fridaPre);
          fridaBlock.appendChild(el('button', {
            className: 'text-[10px] mt-2 px-2 py-1 rounded bg-violet-400/10 text-violet-300 border border-violet-400/20 hover:bg-violet-400/20 transition-colors font-semibold',
            onClick: function(e) { e.stopPropagation(); copyToClipboard(mod.fridaScript, e.target); },
          }, 'Copy Frida Script'));
          expandedSection.appendChild(fridaBlock);
        }

        var copyRow = el('div', { className: 'flex gap-2' });
        copyRow.appendChild(el('button', {
          className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors font-semibold',
          onClick: function(e) { e.stopPropagation(); if (mod.modifiedContent) copyToClipboard(mod.modifiedContent, e.target); },
        }, 'Copy Modified File'));
        if (mod.targetFile) {
          copyRow.appendChild(el('button', {
            className: 'text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors font-semibold',
            onClick: function(e) { e.stopPropagation(); copyToClipboard(mod.targetFile, e.target); },
          }, 'Copy File Path'));
        }
        expandedSection.appendChild(copyRow);
        card.appendChild(expandedSection);
      }

      // Click to toggle
      if (isSupported) {
        card.addEventListener('click', function() {
          var current = new Set(getState().apkAppliedMods || []);
          if (current.has(mod.id)) current['delete'](mod.id);
          else current.add(mod.id);
          setState({ apkAppliedMods: Array.from(current) });
        });
      }

      grid.appendChild(card);
    })(mods[mi]);
  }

  container.appendChild(grid);
}

// ── GitHub-style unified diff renderer ──
function renderDiffBlock(diffText, targetFile) {
  var wrapper = el('div', { className: 'rounded-lg overflow-hidden border border-slate-700' });

  // File header
  var fileHeader = el('div', { className: 'flex items-center gap-2 px-3 py-1.5 bg-slate-800 border-b border-slate-700' });
  fileHeader.appendChild(el('span', { className: 'text-[10px] font-mono text-slate-400' }, targetFile || 'modified file'));
  wrapper.appendChild(fileHeader);

  // Diff body
  var diffBody = el('div', { className: 'overflow-x-auto bg-slate-900' });
  var table = el('table', { className: 'w-full border-collapse text-xs font-mono' });
  var tbody = el('tbody');

  var lines = diffText.split('\n');
  var lineNumOld = 0;
  var lineNumNew = 0;

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];

    var hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
    if (hunkMatch) {
      lineNumOld = parseInt(hunkMatch[1], 10);
      lineNumNew = parseInt(hunkMatch[3], 10);
      var hunkRow = el('tr', { className: 'bg-slate-800/50' });
      hunkRow.appendChild(el('td', { className: 'px-2 py-1 text-slate-500 text-right select-none w-8 border-r border-slate-700' }, ''));
      hunkRow.appendChild(el('td', { className: 'px-2 py-1 text-slate-500 text-right select-none w-8 border-r border-slate-700' }, ''));
      var hunkCell = el('td', { className: 'px-3 py-1 text-cyan-400 text-left' });
      hunkCell.textContent = line;
      hunkRow.appendChild(hunkCell);
      tbody.appendChild(hunkRow);
      continue;
    }

    var prefix = line.charAt(0);
    var content = line.slice(1);
    var row;

    if (prefix === '+') {
      row = el('tr', { className: 'diff-line-added' });
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-slate-600 text-right select-none w-8 border-r border-slate-800' }, ''));
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-emerald-500 text-right select-none w-8 border-r border-slate-800' }, String(lineNumNew++)));
      var addCell = el('td', { className: 'px-3 py-0.5 text-emerald-400' });
      var addSpan = el('span', { className: 'mr-2 text-emerald-600 font-bold' }, '+');
      addSpan.textContent = '+';
      var addContent = el('span', {});
      addContent.textContent = content;
      addCell.appendChild(addSpan);
      addCell.appendChild(addContent);
      row.appendChild(addCell);
      tbody.appendChild(row);
    } else if (prefix === '-') {
      row = el('tr', { className: 'diff-line-removed' });
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-red-500 text-right select-none w-8 border-r border-slate-800' }, String(lineNumOld++)));
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-slate-600 text-right select-none w-8 border-r border-slate-800' }, ''));
      var remCell = el('td', { className: 'px-3 py-0.5 text-red-400' });
      var remSpan = el('span', { className: 'mr-2 text-red-600 font-bold' }, '-');
      remSpan.textContent = '-';
      var remContent = el('span', {});
      remContent.textContent = content;
      remCell.appendChild(remSpan);
      remCell.appendChild(remContent);
      row.appendChild(remCell);
      tbody.appendChild(row);
    } else {
      var lineContent = prefix === ' ' ? content : line;
      row = el('tr', { className: 'diff-line-same' });
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-slate-600 text-right select-none w-8 border-r border-slate-800' }, String(lineNumOld++)));
      row.appendChild(el('td', { className: 'px-2 py-0.5 text-slate-600 text-right select-none w-8 border-r border-slate-800' }, String(lineNumNew++)));
      var ctxCell = el('td', { className: 'px-3 py-0.5 text-slate-400' });
      var ctxSpace = el('span', { className: 'mr-2 text-transparent' }, ' ');
      ctxSpace.textContent = ' ';
      var ctxContent = el('span', {});
      ctxContent.textContent = lineContent;
      ctxCell.appendChild(ctxSpace);
      ctxCell.appendChild(ctxContent);
      row.appendChild(ctxCell);
      tbody.appendChild(row);
    }
  }

  table.appendChild(tbody);
  diffBody.appendChild(table);
  wrapper.appendChild(diffBody);

  wrapper.appendChild(el('button', {
    className: 'text-[10px] m-2 px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:border-slate-500 transition-colors font-semibold',
    onClick: function(e) { e.stopPropagation(); copyToClipboard(diffText, e.target); },
  }, 'Copy Diff'));

  return wrapper;
}

// ── Raw Copy: all mod text to clipboard ──
function copyAllRawText(mods, apkFile, manifest, btnEl) {
  if (!mods || mods.length === 0) return;
  var packageName = (manifest && manifest.package) || (apkFile && apkFile.originalName) || 'Unknown';
  var version = (manifest && manifest.versionName) || '?';
  var lines = [];

  lines.push('APK MODIFICATION REPORT');
  lines.push('========================');
  lines.push('Package: ' + packageName);
  lines.push('Version: ' + version);
  lines.push('Mods Generated: ' + mods.length);
  lines.push('');

  for (var i = 0; i < mods.length; i++) {
    var mod = mods[i];
    lines.push('---');
    lines.push('MOD #' + (i + 1) + ': ' + mod.label);
    lines.push('Category: ' + (mod.category || 'unknown'));
    lines.push('Side: ' + (mod.modSide || 'client'));
    lines.push('Difficulty: ' + (mod.difficulty || 'medium'));
    lines.push('Target File: ' + (mod.targetFile || 'N/A'));
    if (mod.lineRange) lines.push('Line Range: ' + mod.lineRange);
    lines.push('Description: ' + (mod.description || ''));
    if (mod.instructions) {
      lines.push('');
      lines.push('Instructions:');
      lines.push(mod.instructions);
    }
    if (mod.diff) {
      lines.push('');
      lines.push('Diff:');
      lines.push(mod.diff);
    }
    if (mod.fridaScript && mod.fridaScript.length > 5) {
      lines.push('');
      lines.push('Frida Script:');
      lines.push(mod.fridaScript);
    }
    if (mod.fileChanges && mod.fileChanges.length > 0) {
      lines.push('');
      lines.push('File Changes (' + mod.fileChanges.length + ' file(s)):');
      for (var fc = 0; fc < mod.fileChanges.length; fc++) {
        var change = mod.fileChanges[fc];
        lines.push('  >> ' + change.path);
        lines.push('  Content (' + (change.content ? change.content.length : 0) + ' chars):');
        lines.push(change.content || '(empty)');
      }
    }
    lines.push('');
  }

  var text = lines.join('\n');
  copyToClipboard(text, btnEl);
}

// ── SKILL.md export using autonomous multi-agent workflow ──
function exportSkillMd(mode) {
  var s = getState();
  var apk = s.apkFile;
  var allMods = s.apkMods || [];
  var appliedIds = s.apkAppliedMods || [];

  if (!apk || allMods.length === 0) {
    showToast(t('app.apk.selectFirst'));
    return;
  }

  // STRICTLY only use the user-selected (applied) mods + only safe ones.
  var validation = validateModsAgainstAPK(allMods, apk.allFiles || [], apk.editablePaths || []);
  var safeIds = new Set(validation.safeMods.map(function(mod) { return mod.id; }));

  var selectedMods = [];
  for (var i = 0; i < allMods.length; i++) {
    var m = allMods[i];
    if (appliedIds.indexOf(m.id) >= 0 && safeIds.has(m.id)) {
      selectedMods.push(m);
    }
  }

  // NEW: Respect target count (default 3, max 18). Only the first N selected mods will be documented.
  // This enables the "start with 3 → increase target → re-generate (repeat until 18)" workflow.
  var targetCount = Math.min(18, Math.max(1, getState().skillMdTargetCount || 3));
  if (selectedMods.length > targetCount) {
    selectedMods = selectedMods.slice(0, targetCount);
  }

  if (selectedMods.length === 0) {
    showToast('Select at least one safe modification first (click the cards) before generating SKILL.md.');
    return;
  }

  var modelId = s.aiModelId || s.selectedModelId;
  if (!modelId) {
    showToast('No AI model selected. Please choose a model in the Analyze section first.');
    return;
  }

  // Preserve data across long runs
  var currentApkFile = s.apkFile;
  var currentManifest = s.apkManifest;
  var currentMods = s.apkMods || [];
  var currentApplied = s.apkAppliedMods || [];

  setState({
    apkState: 'skillmd-generating',
    apkProgressMsg: 'Starting autonomous SKILL.md generation (' + mode.toUpperCase() + ' style) for the first ' + selectedMods.length + ' of your selected mods (target: ' + targetCount + '/18). This can take many minutes for large APKs.',
    skillMdMode: mode,
    skillMdGenerating: true,
    skillMdResult: null,
    skillMdEditedContent: null,   // clear any previous manual edits when regenerating
    apkCancelRequested: false,
    apkFile: currentApkFile,
    apkManifest: currentManifest,
    apkMods: currentMods,
    apkAppliedMods: currentApplied
  });

  if (typeof showToast === 'function') {
    showToast('Autonomous SKILL.md generation started for your selected mods only — watch the progress below.');
  }

  var skillOptions = s.skillMdOptions || {};
  runSkillMdGenerationWorkflow(apk, s.apkManifest, selectedMods, modelId, mode, skillOptions, function(progress) {
    setState({ apkProgressMsg: progress.message || progress.phase });

    if (progress.phase === 'complete' && progress.result) {
      var content = progress.result;
      var manifestForName = getState().apkManifest || s.apkManifest;
      var filename = (mode === 'mobile')
        ? getMobileSkillMdFilename(manifestForName)
        : getSkillMdFilename(manifestForName);

      // Triple download attempts
      try {
        if (mode === 'mobile') downloadMobileSkillMd(content, filename);
        else downloadSkillMd(content, filename);
        console.log('[SKILL.md] Immediate download attempted for', filename);
      } catch (e) { console.error('Immediate download failed:', e); }

      setTimeout(function() {
        try {
          if (mode === 'mobile') downloadMobileSkillMd(content, filename);
          else downloadSkillMd(content, filename);
          console.log('[SKILL.md] Delayed download attempted for', filename);
        } catch (e) {}
      }, 1200);

      setTimeout(function() {
        try {
          if (mode === 'mobile') downloadMobileSkillMd(content, filename);
          else downloadSkillMd(content, filename);
          console.log('[SKILL.md] Final download retry for', filename);
        } catch (e) {}
      }, 2800);

      if (typeof showToast === 'function') {
        showToast('SKILL.md for your ' + selectedMods.length + ' selected mods is ready! Use the green button if download did not start.');
      }

      var finalState = {
        apkState: 'complete',
        apkProgressMsg: 'SKILL.md ready for your ' + selectedMods.length + ' selected mods only. Click the button below if needed.',
        skillMdGenerating: false,
        skillMdResult: {
          content: content,
          filename: filename,
          mode: mode
        },
        skillMdEditedContent: null,
        apkFile: currentApkFile,
        apkManifest: currentManifest,
        apkMods: currentMods,
        apkAppliedMods: currentApplied
      };
      setState(finalState);
    }

    if (progress.phase === 'fallback' || (progress.message && progress.message.toLowerCase().includes('fallback'))) {
      setState({
        apkState: 'complete',
        apkProgressMsg: 'SKILL.md finished (some steps used fallback for detail). Only your selected mods are included.',
        skillMdGenerating: false,
        apkFile: currentApkFile,
        apkManifest: currentManifest,
        apkMods: currentMods,
        apkAppliedMods: currentApplied
      });
    }
  }).catch(function(err) {
    if (err && err.cancelled) {
      var existingModsOnCancel = currentMods;
      setState({
        apkState: existingModsOnCancel.length > 0 ? 'complete' : 'loaded',
        apkCancelRequested: false,
        apkProgressMsg: '',
        skillMdGenerating: false,
        apkFile: currentApkFile,
        apkManifest: currentManifest,
        apkMods: currentMods,
        apkAppliedMods: currentApplied
      });
      if (typeof showToast === 'function') showToast('SKILL.md generation cancelled.');
      return;
    }
    console.error('SKILL.md autonomous workflow error:', err);
    if (typeof showToast === 'function') showToast(t('app.apk.skillMdFailed', { error: err.message || 'Workflow failed' }));
    setState({
      apkState: 'complete',
      apkProgressMsg: '',
      skillMdGenerating: false,
      apkFile: currentApkFile,
      apkManifest: currentManifest,
      apkMods: currentMods,
      apkAppliedMods: currentApplied
    });
  });
}

// ── Export Markdown: download .md file ──
function exportAsMarkdown(mods, apkFile, manifest) {
  if (!mods || mods.length === 0) return;

  var packageName = (manifest && manifest.package) || (apkFile && apkFile.originalName) || 'Unknown';
  var version = (manifest && manifest.versionName) || '?';
  var versionCode = (manifest && manifest.versionCode) || '?';
  var md = [];

  md.push('# APK Modification Report');
  md.push('');
  md.push('**Package:** `' + packageName + '`  ');
  md.push('**Version:** ' + version + ' (' + versionCode + ')  ');
  md.push('**Mods Generated:** ' + mods.length + '  ');
  md.push('**Generated:** ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC');
  md.push('');
  md.push('---');
  md.push('');

  // Table of contents
  md.push('## Table of Contents');
  md.push('');
  for (var ti = 0; ti < mods.length; ti++) {
    var tm = mods[ti];
    var anchor = tm.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    md.push((ti + 1) + '. [' + tm.label + '](#' + anchor + ') — `' + (tm.category || 'misc') + '`');
  }
  md.push('');
  md.push('---');
  md.push('');

  // Individual mods
  for (var mi = 0; mi < mods.length; mi++) {
    var mod = mods[mi];
    md.push('## Mod #' + (mi + 1) + ': ' + mod.label);
    md.push('');
    md.push('| Field | Value |');
    md.push('|-------|-------|');
    md.push('| **Category** | `' + (mod.category || 'unknown') + '` |');
    md.push('| **Side** | `' + (mod.modSide || 'client') + '` |');
    md.push('| **Difficulty** | `' + (mod.difficulty || 'medium') + '` |');
    md.push('| **Target File** | `' + (mod.targetFile || 'N/A') + '` |');
    if (mod.lineRange) md.push('| **Line Range** | `' + mod.lineRange + '` |');
    md.push('');
    if (mod.description) {
      md.push('> ' + mod.description);
      md.push('');
    }

    if (mod.instructions) {
      md.push('### Instructions');
      md.push('');
      md.push('```');
      md.push(mod.instructions);
      md.push('```');
      md.push('');
    }

    if (mod.diff) {
      md.push('### Diff');
      md.push('');
      md.push('```diff');
      md.push(mod.diff);
      md.push('```');
      md.push('');
    }

    if (mod.fridaScript && mod.fridaScript.length > 5) {
      md.push('### Frida Hook Script');
      md.push('');
      md.push('```javascript');
      md.push(mod.fridaScript);
      md.push('```');
      md.push('');
    }

    if (mod.fileChanges && mod.fileChanges.length > 0) {
      md.push('### Replacement Files (' + mod.fileChanges.length + ')');
      md.push('');
      for (var fc = 0; fc < mod.fileChanges.length; fc++) {
        var change = mod.fileChanges[fc];
        md.push('**`' + change.path + '`**');
        md.push('');
        md.push('```');
        md.push(change.content || '(empty)');
        md.push('```');
        md.push('');
      }
    }

    md.push('---');
    md.push('');
  }

  // Trigger download
  var content = md.join('\n');
  var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = packageName.replace(/[^a-zA-Z0-9._-]/g, '_') + '_mods_' + Date.now() + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
}

function copyToClipboard(text, btnEl) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  if (btnEl) {
    var orig = btnEl.textContent;
    btnEl.textContent = 'Copied!';
    setTimeout(function() { btnEl.textContent = orig; }, 1500);
  }
}

function getCategoryLabel(categoryId, fallback) {
  var keyMap = {
    resources: 'app.common.catResources',
    gameplay: 'app.common.catGameplay',
    combat: 'app.common.catCombat',
    speed: 'app.common.catSpeed',
    premium: 'app.common.catPremium',
    limits: 'app.common.catLimits',
    ads: 'app.common.catAds',
    popups: 'app.common.catPopups',
    unlock: 'app.common.catUnlock',
    security: 'app.common.catSecurity',
    permissions: 'app.common.catPrivacy',
    trackers: 'app.common.catTrackers',
    frida: 'app.common.catFrida',
    debug: 'app.common.catDebug',
    iap: 'app.common.catIAP',
    memory: 'app.common.catMemory',
    native: 'app.common.catNative',
    savedata: 'app.common.catSavedata',
    network: 'app.common.catNetwork',
    automation: 'app.common.catAutomation',
    deobfuscation: 'app.common.catDeobfuscation',
    assets: 'app.common.catAssets',
    spoofing: 'app.common.catSpoofing',
    messaging: 'app.common.catMessaging',
    configuration: 'app.common.catConfiguration',
    cleanup: 'app.common.catCleanup',
    features: 'app.common.catFeatures',
    branding: 'app.common.catBranding',
  };
  var key = keyMap[categoryId];
  return key ? t(key) : fallback;
}

/* ═══════════════════════════════════════════════════════════════
   NEW: Inline SKILL.md Editor (for post-generation adjustments)
   ═══════════════════════════════════════════════════════════════ */

function showSkillMdEditor(container) {
  var s = getState();
  if (!s.skillMdResult || !s.skillMdResult.content) {
    showToast('No SKILL.md has been generated yet.');
    return;
  }

  // Remove any existing editor
  var existing = document.getElementById('skillmd-editor-panel');
  if (existing) existing.remove();

  var currentContent = s.skillMdEditedContent || s.skillMdResult.content;
  var filename = s.skillMdResult.filename || 'SKILL.md';

  var panel = el('div', {
    id: 'skillmd-editor-panel',
    className: 'mt-4 rounded-2xl border border-emerald-400/30 bg-slate-950/80 p-4'
  });

  panel.appendChild(el('div', { className: 'flex items-center justify-between mb-3' },
    el('div', { className: 'flex items-center gap-2' },
      el('span', { className: 'text-emerald-300 font-bold' }, t('app.apk.skillEditor.title') || 'Adjust SKILL.md'),
      el('span', { className: 'text-xs text-slate-400' }, '(' + currentContent.length + ' chars)'),
      el('span', { className: 'text-xs text-slate-500' }, filename)
    ),
    el('button', {
      className: 'text-xs px-3 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white border border-white/10',
      onClick: function() { panel.remove(); }
    }, t('app.apk.skillEditor.closeEditor') || 'Hide Editor')
  ));

  var textarea = el('textarea', {
    className: 'w-full h-[420px] bg-slate-900 border border-white/10 rounded-xl p-4 font-mono text-xs text-emerald-100 resize-y focus:outline-none focus:border-emerald-400/50',
    value: currentContent
  });
  panel.appendChild(textarea);

  var footer = el('div', { className: 'mt-3 flex items-center gap-2 flex-wrap' });

  footer.appendChild(el('button', {
    className: 'px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold text-sm',
    onClick: function() {
      var newContent = textarea.value;
      setState({ skillMdEditedContent: newContent });
      // live update char count on the header
      var header = panel.querySelector('.flex.items-center.gap-2');
      if (header) {
        var chars = header.querySelector('.text-xs.text-slate-400');
        if (chars) chars.textContent = '(' + newContent.length + ' chars)';
      }
      showToast(t('app.apk.skillEditor.editsSaved') || 'Edits saved. Downloads will use your adjusted version.');
    }
  }, t('app.apk.skillEditor.saveEdits') || 'Save Edits'));

  footer.appendChild(el('button', {
    className: 'px-4 py-2 rounded-xl border border-emerald-400/50 text-emerald-200 font-semibold text-sm',
    onClick: function() {
      try {
        var blob = new Blob([textarea.value], { type: 'text/markdown;charset=utf-8' });
        // also immediately save the edit so the main download button uses it
        setState({ skillMdEditedContent: textarea.value });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { console.error(e); }
    }
  }, t('app.apk.skillEditor.downloadEdited') || 'Download Edited Version'));

  footer.appendChild(el('button', {
    className: 'px-3 py-2 rounded-xl text-xs text-slate-300 border border-white/20',
    onClick: function() {
      var ta = document.createElement('textarea');
      ta.value = textarea.value;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast('Copied current editor content');
    }
  }, 'Copy'));

  footer.appendChild(el('button', {
    className: 'px-3 py-2 rounded-xl text-xs text-rose-300 border border-rose-400/40',
    onClick: function() {
      if (confirm('Reset to the original AI-generated version?')) {
        setState({ skillMdEditedContent: null });
        textarea.value = s.skillMdResult.content;
        showToast(t('app.apk.skillEditor.resetDone') || 'Reverted to AI-generated content');
      }
    }
  }, t('app.apk.skillEditor.resetToAi') || 'Reset to Original AI Version'));

  footer.appendChild(el('span', { className: 'text-xs text-slate-500 ml-auto' }, t('app.apk.skillEditor.note') || 'Edits are session-only.'));

  panel.appendChild(footer);

  container.appendChild(panel);
  textarea.focus();
  textarea.selectionStart = 0;
  textarea.selectionEnd = 0;
}
