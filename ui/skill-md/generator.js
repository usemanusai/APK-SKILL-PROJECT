// ui/skill-md/generator.js — Main SKILL.md generator entry point
// Combines Steps 1-3 (always-on MCP setup) with Steps 4+ (per-mod customization)
// Includes a table of contents, full replacement file contents, diffs, and Frida scripts.
// NOW SURFACES SERVER-SIDE DETECTION prominently.

import { buildStep1AndroidMCP, buildStep2ApkMCP, buildStep3ReloadAndVerify } from './mcp-setup.js';
import { buildModSteps } from './mod-steps.js';
import { validateModsAgainstAPK } from '../apk-parser.js';
import {
  generateMobileTutorialSkillMd,
  getMobileSkillMdFilename,
  downloadMobileSkillMd,
} from './mobile-tutorial.js';

// The autonomous multi-agent workflow is in the dedicated orchestrator
import { runSkillMdGenerationWorkflow } from './skillmd-workflow.js';

export {
  generateMobileTutorialSkillMd,
  getMobileSkillMdFilename,
  downloadMobileSkillMd,
  runSkillMdGenerationWorkflow
};

/**
 * Generate a complete SKILL.md document for an AI agent.
 *
 * @param {object} options
 * @param {object} options.apk - The APK file state object
 * @param {object} options.manifest - Parsed manifest data
 * @param {array} options.selectedMods - Array of selected mod objects
 * @returns {string} Complete SKILL.md markdown content
 */
export function generateSkillMd(options) {
  var apk = options.apk;
  var manifest = options.manifest;
  var selectedMods = options.selectedMods || [];
  var opts = options.options || {}; // pre-generation toggles

  function should(key) { return opts[key] !== false; }

  var packageName = (manifest && manifest.package) || 'Unknown';
  var versionName = (manifest && manifest.versionName) || '?';
  var versionCode = (manifest && manifest.versionCode) || '?';
  var apkName = apk ? (apk.originalName || apk.name) : 'Unknown.apk';
  var containerType = apk ? (apk.containerType || 'apk') : 'apk';
  var timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  // Validate mods
  var allMods = selectedMods || [];
  var validation = null;
  if (apk && apk.allFiles) {
    validation = validateModsAgainstAPK(allMods, apk.allFiles, apk.editablePaths || []);
  }

  var safeMods = validation ? validation.safeMods : allMods;
  var unsafeMods = validation ? validation.unsafeMods : [];

  // === NEW: Analyze server-side requirements ===
  var serverMods = safeMods.filter(function(m) { return (m.modSide || 'client') !== 'client'; });
  var hasServerSide = serverMods.length > 0;
  var clientOnlyMods = safeMods.filter(function(m) { return (m.modSide || 'client') === 'client'; });

  // Count replacement files across all safe mods
  var totalReplFiles = 0;
  for (var ri = 0; ri < safeMods.length; ri++) {
    if (safeMods[ri].fileChanges) {
      totalReplFiles += safeMods[ri].fileChanges.length;
    }
  }

  // Count mods with Frida scripts
  var fridaModCount = 0;
  for (var fi = 0; fi < safeMods.length; fi++) {
    if (safeMods[fi].fridaScript && safeMods[fi].fridaScript.length > 10) fridaModCount++;
  }

  var md = [];

  // ── Header ──
  md.push('# SKILL.md — AI Agent APK Modification Instructions');
  md.push('');
  md.push('> **This file is a complete, self-contained instruction set for any AI agent (Claude Code, Google Antigravity IDE, Cursor, etc.) to execute APK modifications using the Android MCP and APK MCP server tools. No prior knowledge of this project is required — follow each step in order.**');
  md.push('');
  md.push('---');
  md.push('');

  // ── Package info block ──
  md.push('## Target Package Information');
  md.push('');
  md.push('| Field | Value |');
  md.push('|-------|-------|');
  md.push('| **Package Name** | `' + packageName + '` |');
  md.push('| **Version** | ' + versionName + ' (code: ' + versionCode + ') |');
  md.push('| **Original File** | `' + apkName + '` |');
  md.push('| **Container Type** | ' + containerType + ' |');
  md.push('| **Total Modifications Selected** | ' + allMods.length + ' |');
  md.push('| **Install-Safe Mods** | ' + safeMods.length + ' |');
  if (unsafeMods.length > 0) {
    md.push('| **Blocked Mods (excluded)** | ' + unsafeMods.length + ' |');
  }
  md.push('| **Replacement Files** | ' + totalReplFiles + ' file(s) |');
  md.push('| **Mods with Frida Scripts** | ' + fridaModCount + ' |');

  // === NEW: Server-side analysis summary ===
  if (hasServerSide) {
    md.push('| **Server-Side Mods Required** | **YES** (' + serverMods.length + ' of ' + safeMods.length + ') — see Server Strategy section |');
  } else {
    md.push('| **Server-Side Mods Required** | No (purely client-side) |');
  }
  md.push('| **Generated** | ' + timestamp + ' |');
  md.push('');
  md.push('---');
  md.push('');

  // ── Table of Contents ──
  md.push('## Table of Contents');
  md.push('');
  md.push('1. [How to Use This File](#how-to-use-this-file)');
  md.push('2. [Selected Modifications Summary](#selected-modifications-summary)');
  if (hasServerSide) {
    md.push('3. [Server-Side Bypass Strategy](#server-side-bypass-strategy)');
  }
  if (should('includeSetup')) {
    var setupStart = hasServerSide ? 4 : 3;
    md.push(setupStart + '. [Step 1 — Install Android MCP Server](#step-1--install-and-configure-the-android-mcp-server)');
    md.push((setupStart + 1) + '. [Step 2 — Install APK MCP Server](#step-2--install-and-configure-the-apk-mcp-server-mt-manager)');
    md.push((setupStart + 2) + '. [Step 3 — Reload and Verify MCP Servers](#step-3--reload-ai-ide--refresh-mcp-servers)');
  }
  var tocStep = should('includeSetup') ? (hasServerSide ? 7 : 6) : (hasServerSide ? 4 : 3);
  var grouped = {};
  var order = [];
  for (var ti = 0; ti < safeMods.length; ti++) {
    var cat = safeMods[ti].category || 'features';
    if (!grouped[cat]) { grouped[cat] = []; order.push(cat); }
    grouped[cat].push(safeMods[ti]);
  }
  for (var oi = 0; oi < order.length; oi++) {
    var catMods = grouped[order[oi]];
    for (var ci = 0; ci < catMods.length; ci++) {
      var anchor = catMods[ci].label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      md.push(tocStep + '. [Step ' + tocStep + ' — ' + catMods[ci].label + '](#step-' + tocStep + '--' + anchor + ')');
      tocStep++;
    }
    tocStep++; // skip category header number
  }
  md.push(tocStep + '. [Step ' + tocStep + ' — Build the Modified APK](#step-' + tocStep + '--build-the-modified-apk)');
  tocStep++;
  if (should('includeValidation')) {
    md.push(tocStep + '. [Step ' + tocStep + ' — Install and Verify on Device](#step-' + tocStep + '--install-and-verify-on-device)');
    tocStep++;
  }
  if (should('includeValidation')) {
    md.push(tocStep + '. [Completion Checklist](#completion-checklist)');
  }
  md.push('');
  md.push('---');
  md.push('');

  // ── Overview / How to use this file ──
  md.push('## How to Use This File');
  md.push('');
  md.push('This document is organized into sequential steps:');
  md.push('');
  if (should('includeSetup')) {
    md.push('- **Steps 1-3 (Always Required):** Set up and verify the Android MCP and APK MCP servers. These must be completed once before any modification work begins. If both servers are already installed and verified, you may skip to Step 4.');
  }
  md.push('- **Steps 4+:** Each step corresponds to a specific modification selected for this APK. Follow them in order. Each step includes the exact APK MCP tool calls needed to read, edit, and verify the change, plus the full replacement file content, diff, and any Frida scripts.');
  if (should('includeValidation')) {
    md.push('- **Final Steps:** Build the modified APK, install it on a device, and verify the modifications are active.');
  } else {
    md.push('- **Final Step:** Build the modified APK (validation / post-edit verification was disabled in options).');
  }
  if (hasServerSide) {
    md.push('- **Server-Side Note:** Some modifications require server changes or MITM response spoofing. See the dedicated "Server-Side Bypass Strategy" section below.');
  }
  md.push('');
  if (should('includeSetup')) {
    md.push('> **⚠️ Critical:** Steps 1-3 MUST be completed before proceeding. The modification steps rely on tools from both MCP servers being available.');
  }
  md.push('');
  md.push('---');
  md.push('');

  // ── Modification summary table (now with Side column highlighted) ──
  md.push('## Selected Modifications Summary');
  md.push('');
  md.push('| # | Modification | Category | Side | Difficulty | Target File | Type | Repl. Files | Frida |');
  md.push('|---|-------------|----------|------|------------|-------------|------|:-----------:|:-----:|');
  for (var i = 0; i < safeMods.length; i++) {
    var mod = safeMods[i];
    var modType = 'Static Edit';
    if (mod.fridaScript && mod.fridaScript.length > 10 && (!mod.modifiedContent || mod.modifiedContent.length < 20)) {
      modType = 'Frida Runtime';
    } else if (mod.fridaScript && mod.fridaScript.length > 10) {
      modType = 'Static + Frida';
    }
    var replCount = mod.fileChanges ? mod.fileChanges.length : 0;
    var hasFrida = (mod.fridaScript && mod.fridaScript.length > 10) ? '✓' : '';
    var sideLabel = (mod.modSide || 'client');
    var sideBadge = sideLabel === 'server' ? '🔴 SERVER' : (sideLabel === 'both' ? '🟣 BOTH' : '🟢 client');
    md.push('| ' + (i + 1) + ' | ' + mod.label + ' | `' + (mod.category || 'features') + '` | ' + sideBadge + ' | ' + (mod.difficulty || 'medium') + ' | `' + (mod.targetFile || 'N/A') + '` | ' + modType + ' | ' + replCount + ' | ' + hasFrida + ' |');
  }
  md.push('');
  if (unsafeMods.length > 0) {
    md.push('### Excluded (Blocked) Modifications');
    md.push('');
    md.push('The following modifications were selected but cannot be safely applied and have been excluded:');
    md.push('');
    for (var ui = 0; ui < unsafeMods.length; ui++) {
      var blocked = unsafeMods[ui];
      var reasons = (blocked.blockedReasons || ['Unknown reason']).join('; ');
      md.push('- **' + blocked.label + '** — ' + reasons);
    }
    md.push('');
  }
  md.push('---');
  md.push('');

  // === NEW: Dedicated Server-Side Bypass Strategy section ===
  if (hasServerSide) {
    md.push('## Server-Side Bypass Strategy');
    md.push('');
    md.push('**⚠️ IMPORTANT:** This APK contains network, purchase, auth, or server-validation logic. The following modifications require server-side changes or client-side spoofing of server responses.');
    md.push('');
    md.push('**Recommended approaches (choose based on your tools):**');
    md.push('');
    md.push('1. **MITM Proxy (mitmproxy / Burp Suite)** — Intercept HTTPS traffic, rewrite JSON responses for unlimited resources, fake purchase success, spoof leaderboard scores.');
    md.push('2. **Frida + Network Hook** — Hook `okhttp3`, `Retrofit`, `HttpURLConnection`, or `WebView` to return fake server data before it reaches the app logic.');
    md.push('3. **Server Emulation** — Run a local mock server and redirect the app\'s base URL (via smali patch) to your mock.');
    md.push('4. **Combined (Client + Server)** — Apply the client smali edit + use Frida to fake the exact server reply the client expects.');
    md.push('');
    md.push('**Server-side mods in this document:**');
    for (var smi = 0; smi < serverMods.length; smi++) {
      var sm = serverMods[smi];
      md.push('- **' + sm.label + '** (`' + (sm.targetFile || '') + '`) — ' + (sm.description || ''));
    }
    md.push('');
    md.push('> For each server mod below, the per-mod section includes both the client edit **and** explicit instructions for the server bypass that must accompany it.');
    md.push('');
    md.push('---');
    md.push('');
  }

  // ── Steps 1-3: MCP setup (optional) ──
  if (should('includeSetup')) {
    md.push(buildStep1AndroidMCP());
    md.push('');
    md.push('---');
    md.push('');
    md.push(buildStep2ApkMCP());
    md.push('');
    md.push('---');
    md.push('');
    md.push(buildStep3ReloadAndVerify());
    md.push('');
    md.push('---');
    md.push('');
  }

  // ── Steps 4+: Per-mod customization (optional) ──
  if (should('includePerMod')) {
    md.push(buildModSteps(safeMods, manifest, apkName, opts));
  } else {
    md.push('## Selected Modifications (summary only)\n');
    for (var si = 0; si < safeMods.length; si++) {
      var sm = safeMods[si];
      var sSide = (sm.modSide || 'client');
      md.push((si+1) + '. ' + sm.label + ' [' + sSide.toUpperCase() + '] — ' + (sm.description || ''));
    }
    md.push('');
  }

  // ── Footer / Checklist (respect toggles) ──
  md.push('---');
  md.push('');
  if (should('includeValidation') || should('includeSetup') || should('includePerMod')) {
    md.push('## Completion Checklist');
    md.push('');
    if (should('includeSetup')) {
      md.push('- [ ] Step 1: Android MCP server installed and verified (`device_list` works)');
      md.push('- [ ] Step 2: APK MCP server installed in MT Manager and verified (`mt_apk_open` works)');
      md.push('- [ ] Step 3: AI IDE reloaded, both MCP servers connected');
    }
    for (var cmi = 0; cmi < safeMods.length; cmi++) {
      var cm = safeMods[cmi];
      var cSide = (cm.modSide || 'client');
      md.push('- [ ] Step 4+.' + (cmi + 1) + ': ' + cm.label + ' [' + cSide.toUpperCase() + '] — edited and verified with `mt_apk_edit_check`');
    }
    md.push('- [ ] Final Build: `mt_apk_build` completed, signed APK produced');
    if (should('includeValidation')) {
      md.push('- [ ] Install: Modified APK installed on device via `app_install`');
      md.push('- [ ] Verify: App launched and modifications confirmed via `screenshot` / `ui_dump` / Frida hook');
    } else {
      md.push('- [ ] (Verification step disabled in SKILL.md options — install & test manually if needed)');
    }
    if (hasServerSide) {
      md.push('- [ ] Server Bypass: Applied MITM / Frida / mock server for all server-side mods');
    }
    md.push('');
  }
  md.push('---');
  md.push('');
  md.push('*Generated by APK Structure Analyzer on ' + timestamp + '*');
  md.push('');

  return md.join('\n');
}

/**
 * Generate the SKILL.md filename based on package name.
 */
export function getSkillMdFilename(manifest) {
  var pkg = (manifest && manifest.package) || 'apk';
  var safe = pkg.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe + '_SKILL.md';
}

/**
 * Trigger a browser download of the SKILL.md content.
 */
export function downloadSkillMd(content, filename) {
  try {
    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 8000);
  } catch (e) {
    console.error('downloadSkillMd failed:', e);
    // Fallback: try to open in new tab as text
    try {
      var dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
      window.open(dataUrl, '_blank');
    } catch (_) {}
  }
}
