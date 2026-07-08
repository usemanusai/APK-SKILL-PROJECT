// ui/skill-md/skillmd-workflow.js — Autonomous Multi-Agent SKILL.md Generator
//
// Uses the SAME phased orchestration pattern as apk-workflow.js (Recon → Specialists batched → Validation/Assembly)
//
// TWO MODES:
//   - 'mcp': Produces the classic detailed MCP-instruction SKILL.md (Steps 1-3 + per-mod tool call sequences)
//   - 'mobile': Produces the Gemini + MT Manager mobile tutorial style (screenshot-driven, phone-executable)
//
// Agents:
//   1. SKILL-Recon Agent     : Analyzes APK + mods + decides exact sections, screenshot points, tool sequences needed
//   2. Android-MCP Specialist: Writes ultra-precise android-mcp tool call blocks (scrcpy, ui_dump, screenshot, file_push, etc.)
//   3. Apk-MCP Specialist    : Writes ultra-precise mt_apk_* sequences (open, read, edit, build) with exact locators
//   4. Per-Mod Writer Agents : Detailed step-by-step for each mod (batched)
//   5. Assembler + Precision Agent: Combines everything, adds troubleshooting, dynamic waits, file inventory
//
// Can take a very long time for large APK + many mods because every step must be phone-precise.

import { SYSTEM_PROMPT_PRIMARY } from '../ai-analysis.js';

var t = function(key, vals) {
  var i18n = window.miniappI18n;
  if (i18n && typeof i18n.t === 'function') {
    try { return i18n.t(key, vals); } catch (e) {}
  }
  return key;
};

var RECON_TIMEOUT = 420000;       // 7 minutes - SKILL.md recon for large APKs + many mods
var SPECIALIST_TIMEOUT = 480000;    // 8 minutes per specialist — each step must be extremely detailed for phone execution
var ASSEMBLY_TIMEOUT = 360000;      // 6 minutes
var MAX_BATCH = 1; // 1 at a time for extreme detail and length of SKILL.md content (phone-executable precision)

var ANDROID_MCP_TOOLS = [
  'start_session', 'stop_session', 'device_list', 'device_info', 'screen_on', 'screen_off',
  'connect_wifi', 'disconnect_wifi', 'rotate_device', 'expand_notifications', 'expand_settings',
  'collapse_panels', 'screenshot', 'screen_record_start', 'screen_record_stop', 'swipe',
  'drag_drop', 'input_text', 'key_event', 'scroll', 'app_start', 'app_stop', 'app_install',
  'app_uninstall', 'app_list', 'app_current', 'clipboard_get', 'clipboard_set', 'ui_dump',
  'ui_find_element', 'shell_exec', 'file_push', 'file_pull', 'file_list', 'start_video_stream', 'stop_video_stream'
];

var APK_MCP_TOOLS = [
  'mt_apk_open', 'mt_apk_list_available_apks', 'mt_apk_list', 'mt_apk_outline_class',
  'mt_apk_read_text', 'mt_apk_read_zip_bytes', 'mt_apk_read_resource', 'mt_apk_search',
  'mt_apk_xref_dex', 'mt_apk_xref_resource', 'mt_apk_continue', 'mt_apk_edit_open',
  'mt_apk_edit_text', 'mt_apk_edit_resource', 'mt_apk_edit_check', 'mt_apk_build', 'mt_apk_close'
];

// ── Progress helper ──
function safeProgress(onProgress, data) {
  if (!onProgress) return;
  try { onProgress(data); } catch (_) {}
}

function safeError(err) {
  try {
    return err && err.message ? String(err.message) : 'Unknown error';
  } catch (_) { return 'Unknown error'; }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── SKILL.md specific system prompts ──

var SKILL_RECON_SYSTEM = `You are the SKILL.md RECON agent.
Your job: analyze the APK structure + the list of selected mods and produce a precise blueprint for TWO different SKILL.md documents.

You must output ONLY a JSON array of "sections" that will be needed.

Each section object:
{
  "type": "android-mcp" | "apk-mcp" | "per-mod" | "verification" | "troubleshooting",
  "title": "short title",
  "priority": 1-10,
  "modsInvolved": ["label1", ...] or [],
  "needsScreenshots": true/false,
  "needsExactToolCalls": true/false,
  "description": "what this section must contain in extreme detail"
}

Prioritize:
- Exact tool names from the provided android-mcp and apk-mcp lists
- Screenshot points for every important action (especially on the phone using MT Manager + Gemini)
- Dynamic wait conditions (file size, spinner disappearance, etc.)
- Error paths and recovery
- Very long, phone-executable steps because the final document will be used on an Android device

Return ONLY the JSON array. Nothing else.`;

var ANDROID_MCP_SPECIALIST_SYSTEM = `You are the Android-MCP Specialist writer.
You write EXTREMELY detailed, copy-paste ready instruction blocks that use ONLY the exact tools from this list:

${ANDROID_MCP_TOOLS.join(', ')}

For every action the user or the AI agent will perform on the phone (taking screenshots, controlling MT Manager, installing the final APK, verifying dialogs are gone, etc.) you must:
- Give the exact function name
- List every required parameter with realistic example values
- Describe what the tool will return
- Tell the user exactly what to look for on screen (including how to use screenshot + ui_dump)
- Include dynamic wait instructions ("wait until the spinner disappears", "wait for the new _signed.apk file to appear")
- Mention scrcpy session when it makes sense for speed

Output format: a single markdown section ready to be inserted into SKILL.md.

Be obsessive about precision. The final document will be executed on a real Android phone.`;

var APK_MCP_SPECIALIST_SYSTEM = `You are the APK-MCP Specialist writer.
You write EXTREMELY detailed, copy-paste ready instruction blocks that use ONLY the exact tools from this list:

${APK_MCP_TOOLS.join(', ')}

For every step that touches the APK inside MT Manager you must:
- Start with the correct first tool (almost always mt_apk_open with temporary or persistent)
- Show the exact locator strings that will come back from mt_apk_list / mt_apk_outline_class
- Show the exact calls to mt_apk_read_text, mt_apk_edit_text, mt_apk_edit_open, mt_apk_edit_check, mt_apk_build
- Include targetVersion handling and how to copy it
- Show how to handle MultiDex, classes.dex vs classes2.dex
- Describe what success output looks like
- Include the final mt_apk_build + how to install the result with app_install or manually

Output format: a single markdown section ready to be inserted into SKILL.md.

Be obsessive about precision. This will be followed on a real Android phone using MT Manager + an MCP client.`;

var PER_MOD_WRITER_SYSTEM = `You are a Per-Modification Detailed Step Writer for SKILL.md.

Given ONE mod (with its label, description, targetFile, diff, instructions, fridaScript, fileChanges), produce an ultra-detailed "Step X — <label>" section.

The section must contain:
1. Goal (what the user wants to achieve)
2. Exact prerequisite tools that must be ready (scrcpy session + mt_apk_open workspace)
3. Numbered sub-steps with:
   - Exact tool name + full parameter example
   - What to copy from previous tool output
   - What screenshot to take and what to send to Gemini (for mobile mode)
   - Expected UI state on the phone
4. The complete replacement content (from fileChanges) shown in a code block
5. The diff (if any)
6. Frida script (if any) in a ready-to-paste block
7. Verification step using ui_dump + screenshot after the edit
8. Common failure modes + exact recovery commands

Write at a level where a careful person following on their phone can succeed even if they have never used these tools before.

Return ONLY the markdown for this one step.`;

var ASSEMBLER_SYSTEM = `You are the SKILL.md Assembler + Precision Agent.

You receive:
- The full list of generated sections from Recon + Specialists
- The two target styles: 'mcp' and 'mobile'

You must produce ONE complete, high-precision SKILL.md document.

Requirements:
- Use the exact tool names from the lists (never invent new ones)
- Include a table of contents with correct anchors
- For 'mcp' style: include the classic 3 setup steps + per-mod steps + final build
- For 'mobile' style: structure as phases (1. Identify problem with screenshot, 2. Send manifest, 3. Navigate in MT Manager, 4. Locate trigger in Dex Editor+, 5. Apply fix, 6. Rebuild & sign, 7. Verify) with placeholder screenshot references like step_t0120.png and arrows
- Add a "Dynamic Wait Conditions" table
- Add a "Troubleshooting Matrix" with at least 12 rows
- Add ethical use + out-of-scope warnings
- Add a complete "File Inventory" section at the end listing every referenced screenshot placeholder

Make every instruction phone-executable and extremely detailed.

Return ONLY the complete markdown document.`;

// ── Helper to call model ──
function callModel(modelId, system, user, timeout) {
  return window.miniappsAI.callModel({
    modelId: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    timeoutMs: timeout
  }).then(result => {
    return window.miniappsAI.extractText(result) || '';
  });
}

function parseJsonArrayRobust(raw) {
  if (!raw || raw.trim().length === 0) return null;
  // reuse the robust parser from apk-workflow
  var strategies = [
    s => JSON.parse(s),
    s => { var m = s.match(/```(?:json)?\s*\n?([\s\S]*?)```/); return JSON.parse(m ? m[1].trim() : s); },
    s => { var i = s.indexOf('['), j = s.lastIndexOf(']'); return JSON.parse(s.slice(i, j+1)); }
  ];
  for (var si = 0; si < strategies.length; si++) {
    try {
      var p = strategies[si](raw);
      if (Array.isArray(p)) return p;
    } catch (_) {}
  }
  return null;
}

// ── Main Orchestrator ──
// CRITICAL CONTRACT: This function MUST ONLY document the mods passed in the `selectedMods` argument.
// The caller (mods-view.js exportSkillMd) has already filtered to ONLY the mods the user explicitly clicked (appliedIds + safe).
// We NEVER look at state.apkMods, never fall back to "all mods", and never add extra steps.
// If the user selected 3 mods, the SKILL.md will have exactly 3 per-mod steps.
export function runSkillMdGenerationWorkflow(apk, manifest, selectedMods, modelId, mode, optionsOrCallback, onProgress) {
  // Support both old signature (5 args + cb) and new (options + cb)
  var options = {};
  var onProg = onProgress;
  if (typeof optionsOrCallback === 'function') {
    onProg = optionsOrCallback;
  } else if (optionsOrCallback && typeof optionsOrCallback === 'object') {
    options = optionsOrCallback;
    onProg = onProgress;
  }

  // HARD DEFENSIVE FILTER + LOG
  var modsToUse = Array.isArray(selectedMods) ? selectedMods.slice(0) : [];
  console.log('[SKILL.md] Workflow received EXACTLY', modsToUse.length, 'user-selected mods. Will document ONLY these. Labels:', modsToUse.map(m => m.label).join(' | '));
  if (modsToUse.length === 0) {
    safeProgress(onProg, { phase: 'complete', result: '# SKILL.md\n\nNo mods were selected by the user. Please tap the mod cards you want to include, then press SKILL.md again.' });
    return Promise.resolve('# SKILL.md\n\nNo mods selected.');
  }
  var startTime = Date.now();
  var modCount = modsToUse.length;

  var optStr = Object.keys(options).filter(k => options[k] !== false).join(', ') || 'all sections';
  safeProgress(onProg, {
    phase: 'init',
    message: `Starting autonomous SKILL.md generation (${mode} style) for the first ${modCount} mods (user target up to 18).\n\nContent options: ${optStr}\n\nEach step is written with EXTREME phone-executable precision (android-mcp + apk-mcp tools).\n\nThis can legitimately take 8–30+ minutes for large APKs or many mods. The UI stays responsive. Watch this banner for live agent progress.`,
    percent: 0
  });

  // Phase 1: SKILL Recon
  var reconPrompt = buildReconPrompt(apk, manifest, modsToUse, mode);

  return callModel(modelId, SKILL_RECON_SYSTEM, reconPrompt, RECON_TIMEOUT)
    .then(raw => {
      var sections = parseJsonArrayRobust(raw) || [];
      safeProgress(onProg, {
        phase: 'recon-done',
        message: `Recon identified ${sections.length} ultra-detailed sections. Starting Android-MCP + Apk-MCP specialists (this takes time for phone-precision)...`,
        percent: 15
      });
      return { sections, apk, manifest, selectedMods: modsToUse, mode, options };
    })
    .then(ctx => runAndroidMcpSpecialist(ctx, modelId, onProg))
    .then(ctx => runApkMcpSpecialist(ctx, modelId, onProg))
    .then(ctx => runPerModWriters(ctx, modelId, onProg))
    .then(ctx => runAssembler(ctx, modelId, onProg))
    .then(finalMd => {
      var elapsed = Math.round((Date.now() - startTime) / 1000);
      safeProgress(onProgress, {
        phase: 'complete',
        message: `SKILL.md generation complete in ${elapsed}s. Ready for download.`,
        percent: 100,
        result: finalMd
      });
      return finalMd;
    })
    .catch(err => {
      console.error('SKILL.md workflow failed:', err);
      safeProgress(onProgress, {
        phase: 'fallback',
        message: 'One or more agents timed out — producing high-quality fallback SKILL.md (still very detailed)...',
        percent: 90
      });
      // Fallback to existing generators so we never leave the user empty-handed
      return generateFallbackSkillMd(apk, manifest, selectedMods, mode, options).then(function(fallbackMd) {
        var elapsed = Math.round((Date.now() - startTime) / 1000);
        safeProgress(onProgress, {
          phase: 'complete',
          message: `SKILL.md generation complete (high-quality fallback after ${elapsed}s). Ready for download.`,
          percent: 100,
          result: fallbackMd
        });
        return fallbackMd;
      });
    });
}

function buildReconPrompt(apk, manifest, mods, mode) {
  var pkg = (manifest && manifest.package) || 'unknown';
  var lines = [
    'APK: ' + (apk.originalName || 'unknown'),
    'Package: ' + pkg,
    'Mode requested: ' + mode,
    'Number of mods: ' + mods.length,
    '',
    'MODS TO DOCUMENT:',
  ];

  mods.forEach((m, i) => {
    lines.push((i+1) + '. ' + m.label + ' → ' + (m.targetFile || 'N/A') + ' [' + (m.category || 'features') + ']');
  });

  lines.push('');
  lines.push('Produce the section blueprint as JSON array.');
  return lines.join('\n');
}

function runAndroidMcpSpecialist(ctx, modelId, onProgress) {
  safeProgress(onProgress, {
    phase: 'android-mcp',
    message: 'Android-MCP Specialist writing precise device control + screenshot steps (scrcpy, ui_dump, file_push, app_install, etc.)...',
    percent: 25
  });

  var prompt = 'Generate the complete "Android Device Control & Screenshot" section for a ' + ctx.mode + ' style SKILL.md.\n\n' +
    'Target APK: ' + (ctx.apk.originalName || '') + '\n' +
    'Number of mods: ' + ctx.selectedMods.length + '\n' +
    'Key actions needed: open MT Manager, view APK, navigate Dex Editor+, take screenshots of dialogs, verify after patch. Use ONLY the exact tool names from the list.';

  return callModel(modelId, ANDROID_MCP_SPECIALIST_SYSTEM, prompt, SPECIALIST_TIMEOUT)
    .then(text => {
      ctx.androidMcpSection = text || '## Android Device Control & Screenshot\n\n(Section generated via fallback — follow standard scrcpy / ui_dump / app_install flow using the tools listed at the top of this document.)';
      safeProgress(onProgress, { phase: 'android-mcp-done', percent: 40 });
      return ctx;
    })
    .catch(() => {
      ctx.androidMcpSection = '## Android Device Control & Screenshot\n\nUse scrcpy or built-in screenshot tool, ui_dump, file_push for scripts, app_install for the final APK. Take screenshots of every important dialog and state.';
      safeProgress(onProgress, { phase: 'android-mcp-done', percent: 40 });
      return ctx;
    });
}

function runApkMcpSpecialist(ctx, modelId, onProgress) {
  safeProgress(onProgress, {
    phase: 'apk-mcp',
    message: 'APK-MCP Specialist writing exact mt_apk_* sequences for opening, editing and building (mt_apk_open, mt_apk_edit_text, mt_apk_edit_check, mt_apk_build, etc.)...',
    percent: 45
  });

  var prompt = 'Generate the complete "APK Editing with mt_apk_* tools" section.\n\n' +
    'Target: ' + (ctx.manifest && ctx.manifest.package) + '\n' +
    'Mods: ' + ctx.selectedMods.map(m => m.label).join(', ') + '\n' +
    'Include opening the workspace with mt_apk_open, finding classes.dex, reading smali with mt_apk_read_text, editing with mt_apk_edit_text, mt_apk_edit_open + mt_apk_edit_check, and final mt_apk_build. Use ONLY the exact tool names. Be extremely detailed.';

  return callModel(modelId, APK_MCP_SPECIALIST_SYSTEM, prompt, SPECIALIST_TIMEOUT)
    .then(text => {
      ctx.apkMcpSection = text || '## APK Editing with mt_apk_* tools\n\n(Use mt_apk_open, mt_apk_read_text, mt_apk_edit_text, mt_apk_edit_check, mt_apk_build with the exact locators for the selected mods.)';
      safeProgress(onProgress, { phase: 'apk-mcp-done', percent: 60 });
      return ctx;
    })
    .catch(() => {
      ctx.apkMcpSection = '## APK Editing with mt_apk_* tools\n\n1. mt_apk_open the package.\n2. Use mt_apk_read_text on the target files of the selected mods.\n3. Apply edits with mt_apk_edit_text or mt_apk_edit_resource.\n4. Run mt_apk_edit_check.\n5. Finally mt_apk_build.';
      safeProgress(onProgress, { phase: 'apk-mcp-done', percent: 60 });
      return ctx;
    });
}

function runPerModWriters(ctx, modelId, onProgress) {
  var mods = ctx.selectedMods;
  var total = mods.length;
  var results = [];
  var chain = Promise.resolve();

  for (var i = 0; i < total; i += MAX_BATCH) {
    var batch = mods.slice(i, i + MAX_BATCH);
    (function(b, startIdx) {
      chain = chain.then(() => {
        safeProgress(onProgress, {
          phase: 'per-mod',
          message: `Per-Mod Writer: ultra-detailed phone steps for "${b[0].label}" (${startIdx + 1}/${total}). This can take 6-10 minutes per mod for full precision.`,
          percent: 60 + Math.floor(((startIdx) / total) * 25)
        });

        var prompt = 'Write ONE ultra-detailed SKILL.md step section for this mod:\n\n' +
          JSON.stringify({
            label: b[0].label,
            targetFile: b[0].targetFile,
            description: b[0].description,
            diff: (b[0].diff || '').slice(0, 1400),
            instructions: (b[0].instructions || '').slice(0, 1000),
            hasFrida: !!(b[0].fridaScript && b[0].fridaScript.length > 20),
            fileChanges: (b[0].fileChanges || []).slice(0, 1)
          });

        return callModel(modelId, PER_MOD_WRITER_SYSTEM, prompt, SPECIALIST_TIMEOUT)
          .then(text => {
            results.push(text);
          })
          .catch(e => {
            // Timeout is expected for extreme phone-precision (8 min per mod).
            // Silent fallback — no console spam for normal long runs. The final SKILL.md only documents the mods the user selected.
            results.push(
              '### Step ' + (startIdx + 1) + ' — ' + b[0].label + '\n\n' +
              '**Goal:** ' + (b[0].description || 'Apply this modification') + '\n\n' +
              '1. Open the APK in MT Manager using `mt_apk_open`.\n' +
              '2. Locate the file: `' + (b[0].targetFile || 'target') + '`\n' +
              '3. Use `mt_apk_read_text` then `mt_apk_edit_text` with the instructions below.\n\n' +
              (b[0].instructions ? '### Original Instructions\n' + b[0].instructions + '\n\n' : '') +
              (b[0].diff ? '### Diff\n```diff\n' + b[0].diff.slice(0, 800) + '\n```\n\n' : '') +
              '(Full agent-generated content for this step timed out — follow the diff + instructions from the mod card above.)\n'
            );
          });
      });
    })(batch, i);
  }

  return chain.then(() => {
    ctx.perModSections = results;
    safeProgress(onProgress, { phase: 'per-mod-done', percent: 85 });
    return ctx;
  });
}

function runAssembler(ctx, modelId, onProgress) {
  safeProgress(onProgress, {
    phase: 'assembly',
    message: 'Assembler combining all sections into final high-precision SKILL.md...',
    percent: 90
  });

  var summary = {
    mode: ctx.mode,
    package: ctx.manifest && ctx.manifest.package,
    modCount: ctx.selectedMods.length,
    hasAndroidSection: !!ctx.androidMcpSection,
    hasApkSection: !!ctx.apkMcpSection,
    perModCount: (ctx.perModSections || []).length,
    options: ctx.options || {}
  };

  var prompt = 'Assemble the final SKILL.md.\n\n' +
    'MODE: ' + ctx.mode + '\n' +
    'SUMMARY: ' + JSON.stringify(summary) + '\n\n' +
    'ANDROID SECTION:\n' + (ctx.androidMcpSection || '') + '\n\n' +
    'APK SECTION:\n' + (ctx.apkMcpSection || '') + '\n\n' +
    'PER-MOD SECTIONS:\n' + (ctx.perModSections || []).join('\n\n---\n\n') + '\n\n' +
    'IMPORTANT FILTERING INSTRUCTIONS (respect these strictly):\n' +
    '- If options.includeSetup is false, omit or shorten Steps 1-3.\n' +
    '- If options.includePerMod is false, produce only a brief summary of the mods (no full detailed steps).\n' +
    '- If options.includeFullFiles is false, do not include complete replacement file contents (use "see original mod card" instead).\n' +
    '- If options.includeDiffs is false, omit the Diff sections.\n' +
    '- If options.includeFrida is false, omit all Frida scripts.\n' +
    '- If options.includeTroubleshooting is false, omit or shorten the Troubleshooting Matrix.\n' +
    '- If options.includeDynamicWaits is false, omit the Dynamic Wait Conditions table.\n' +
    '- If options.includeWarnings is false, omit Warnings & Ethical Use sections.\n' +
    '- If options.includeInventory is false, omit the File Inventory section.\n' +
    '- For mobile mode: if options.mobileScreenshots is false, do not generate screenshot placeholder lines.\n' +
    '- If options.includeValidation is false, omit ALL post-edit verification steps, mt_apk_edit_check, "screenshot of unlocked features", install verification, ui_dump after edit, and any "verify that the features are now unlocked" instructions. The document should stop at the edit + build step without assuming the changes are already active.\n\n' +
    'Produce a clean, well-structured document that follows the above filtering rules exactly.';

  return callModel(modelId, ASSEMBLER_SYSTEM, prompt, ASSEMBLY_TIMEOUT)
    .then(finalMd => {
      safeProgress(onProgress, { phase: 'assembly-done', percent: 95 });
      return finalMd;
    });
}

// Very high quality fallback using the existing generators
function generateFallbackSkillMd(apk, manifest, mods, mode, options) {
  if (mode === 'mobile') {
    // We import dynamically to avoid circular issues
    return import('./mobile-tutorial.js').then(m => {
      return m.generateMobileTutorialSkillMd({ apk, manifest, selectedMods: mods, options: options || {} });
    });
  } else {
    return import('./generator.js').then(m => {
      return m.generateSkillMd({ apk, manifest, selectedMods: mods, options: options || {} });
    });
  }
}
