// ui/skill-md/mod-steps.js — Steps 4+: customized per selected mods
// Generates detailed, per-mod instructions for an AI agent using APK MCP + Android MCP tools.
// Includes full replacement file contents, diffs, Frida scripts, and instructions — matching
// the richness of the standalone markdown export but wrapped in actionable MCP tool-call steps.

import { AI_CATEGORIES } from '../ai-analysis.js';

// Categorize a mod's target file to determine the APK MCP locator type
function inferLocatorType(targetFile) {
  if (!targetFile) return 'zip_entry';
  var lower = targetFile.toLowerCase();
  if (lower.indexOf('androidmanifest.xml') >= 0 || lower.indexOf('.xml') >= 0) return 'axml';
  if (lower.indexOf('.smali') >= 0) return 'smali';
  if (lower.indexOf('resources.arsc') >= 0) return 'resource';
  return 'zip_entry';
}

// Determine if a mod is a Frida-only mod (no static APK edit, only runtime hook)
function isFridaOnlyMod(mod) {
  return Boolean(mod.fridaScript && mod.fridaScript.length > 10) &&
    (!mod.modifiedContent || mod.modifiedContent.length < 20) &&
    (!mod.diff || mod.diff.length < 10);
}

// Determine if a mod edits resources.arsc values
function isResourceMod(mod) {
  var cat = mod.category || '';
  return cat === 'assets' || cat === 'branding' ||
    (mod.targetFile && mod.targetFile.toLowerCase().indexOf('resources.arsc') >= 0);
}

// Truncate very long content for readability in the SKILL.md
function truncateForDisplay(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n... (truncated for brevity — see full content in the replacement files section below or the original APK)';
}

// Build the info table for a mod
function buildInfoTable(mod, catInfo, locatorType, fridaOnly, resourceMod) {
  var lines = [];
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| **Category** | ' + catInfo.name + ' (`' + (mod.category || 'features') + '`) |');
  lines.push('| **Side** | ' + (mod.modSide || 'client') + ' |');
  lines.push('| **Difficulty** | ' + (mod.difficulty || 'medium') + ' |');
  lines.push('| **Target File** | `' + (mod.targetFile || 'N/A') + '` |');
  if (mod.lineRange) lines.push('| **Line Range** | ' + mod.lineRange + ' |');
  lines.push('| **Locator Type** | ' + locatorType + ' |');
  if (fridaOnly) lines.push('| **Mod Type** | Frida Runtime Hook (no static APK edit) |');
  else if (resourceMod) lines.push('| **Mod Type** | Resource Value Edit (resources.arsc) |');
  else lines.push('| **Mod Type** | Static APK Text Edit |');
  if (mod.fileChanges && mod.fileChanges.length > 0) {
    lines.push('| **Replacement Files** | ' + mod.fileChanges.length + ' file(s) |');
  }
  return lines.join('\n');
}

// Build the instructions section
function buildInstructionsSection(mod) {
  if (!mod.instructions) return '';
  var lines = [];
  lines.push('#### Instructions');
  lines.push('');
  lines.push('```');
  lines.push(mod.instructions);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// Build the diff section
function buildDiffSection(mod) {
  if (!mod.diff) return '';
  var lines = [];
  lines.push('#### Diff (Reference — What Changed)');
  lines.push('');
  lines.push('```diff');
  lines.push(mod.diff);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// Build the Frida script section
function buildFridaSection(mod, isOptional) {
  if (!mod.fridaScript || mod.fridaScript.length <= 10) return '';
  var lines = [];
  if (isOptional) {
    lines.push('#### Optional: Runtime Verification Hook (Frida)');
    lines.push('');
    lines.push('After building and installing the modified APK, you can optionally use this Frida script to verify the modification is active at runtime:');
  } else {
    lines.push('#### Frida Hook Script');
    lines.push('');
    lines.push('This modification includes a Frida runtime hook script. Use it alongside or instead of the static APK edit:');
  }
  lines.push('');
  lines.push('```javascript');
  lines.push(mod.fridaScript);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// Build the replacement files section (full file contents)
function buildReplacementFilesSection(mod) {
  if (!mod.fileChanges || mod.fileChanges.length === 0) return '';
  var lines = [];
  lines.push('#### Replacement Files (' + mod.fileChanges.length + ')');
  lines.push('');
  lines.push('These are the complete modified file contents that should replace the originals in the APK:');
  lines.push('');
  for (var i = 0; i < mod.fileChanges.length; i++) {
    var change = mod.fileChanges[i];
    lines.push('**`' + change.path + '`**');
    lines.push('');
    // Determine language hint from file extension
    var ext = '';
    var lowerPath = (change.path || '').toLowerCase();
    if (lowerPath.indexOf('.json') >= 0) ext = 'json';
    else if (lowerPath.indexOf('.xml') >= 0) ext = 'xml';
    else if (lowerPath.indexOf('.smali') >= 0) ext = 'smali';
    else if (lowerPath.indexOf('.plist') >= 0) ext = 'xml';
    else if (lowerPath.indexOf('.vsh') >= 0 || lowerPath.indexOf('.fsh') >= 0) ext = 'glsl';
    else if (lowerPath.indexOf('.js') >= 0) ext = 'javascript';
    lines.push('```' + ext);
    // Truncate extremely long files to keep SKILL.md manageable
    var content = change.content || '(empty)';
    if (content.length > 50000) {
      lines.push(truncateForDisplay(content, 50000));
    } else {
      lines.push(content);
    }
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

function buildModStep(mod, stepNum, manifest, apkName, opts) {
  opts = opts || {};
  function should(key) { return opts[key] !== false; }

  var lines = [];
  var cat = mod.category || 'features';
  var catInfo = AI_CATEGORIES[cat] || AI_CATEGORIES.features;
  var locatorType = inferLocatorType(mod.targetFile);
  var fridaOnly = isFridaOnlyMod(mod);
  var resourceMod = isResourceMod(mod);

  // ── Header ──
  lines.push('### Step ' + stepNum + ' — ' + mod.label);
  lines.push('');
  lines.push(buildInfoTable(mod, catInfo, locatorType, fridaOnly, resourceMod));
  lines.push('');

  // Description
  if (mod.description) {
    lines.push('> ' + mod.description);
    lines.push('');
  }

  // ── Instructions section ──
  var instructions = buildInstructionsSection(mod);
  if (instructions && should('includeFullFiles')) {
    lines.push(instructions);
  }

  // ── Frida-only mods: no APK editing needed, just runtime injection ──
  if (fridaOnly) {
    lines.push('#### Runtime Hook (Frida)');
    lines.push('');
    lines.push('This modification is applied at runtime via a Frida script. No static APK edit is needed.');
    lines.push('');
    lines.push('1. Push the Frida script to the device using `file_push`.');
    lines.push('2. Launch the target app using `app_start` with package `' + (manifest && manifest.package ? manifest.package : '<package>') + '`.');
    lines.push('3. Attach Frida to the running process (use `shell_exec` to run `frida -U -f <package> -l <script.js>`).');
    lines.push('4. Verify the hook is active by taking a `screenshot` or checking `ui_dump` for expected UI state.');
    lines.push('');

    // Frida script
    if (should('includeFrida')) {
      var fridaSection = buildFridaSection(mod, false);
      if (fridaSection) lines.push(fridaSection);
    }
    // Replacement files (some Frida mods may still include file payloads)
    if (should('includeFullFiles')) {
      var replSection = buildReplacementFilesSection(mod);
      if (replSection) lines.push(replSection);
    }
    return lines.join('\n');
  }

  // ── Static APK edits: use APK MCP workflow ──
  var apkPath = apkName || '<original-apk-path>';

  // Step A: Open workspace
  lines.push('#### A. Open the APK Workspace');
  lines.push('');
  lines.push('```json');
  lines.push('// mt_apk_open — open the target APK for inspection');
  lines.push('{');
  lines.push('  "path": "' + apkPath + '",');
  lines.push('  "temporary": true');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('> **Save** the returned `workspaceId` and `editSessionId` (if provided). If no edit session is returned, open one with `mt_apk_edit_open`.');
  lines.push('');

  // Step B: Read the original file content
  if (locatorType === 'resource') {
    lines.push('#### B. Read the Current Resource Value');
    lines.push('');
    lines.push('```json');
    lines.push('// mt_apk_read_resource — read the resource value before editing');
    lines.push('{');
    lines.push('  "workspaceId": "<workspaceId>",');
    lines.push('  "editSessionId": "<editSessionId>",');
    lines.push('  "reads": [{');
    lines.push('    "locator": "resource:0x<resourceId>",');
    lines.push('    "variant": "default"');
    lines.push('  }],');
    lines.push('  "maxValueChars": 4096,');
    lines.push('  "maxValueXmlChars": 32768,');
    lines.push('  "maxItemsPerValue": 50,');
    lines.push('  "resolveDepth": 0');
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push('> **Save** the returned `targetVersion`, `valueXml`, `locator`, and `variant` from the result. These are required for the edit step.');
    lines.push('');
  } else {
    lines.push('#### B. Read the Original File Content');
    lines.push('');
    var locatorStr = locatorType === 'smali' ? 'smali:' + mod.targetFile :
      locatorType === 'axml' ? 'axml:' + mod.targetFile :
      'zip_entry:' + mod.targetFile;

    lines.push('```json');
    lines.push('// mt_apk_read_text — read the original file content');
    lines.push('{');
    lines.push('  "workspaceId": "<workspaceId>",');
    lines.push('  "editSessionId": "<editSessionId>",');
    lines.push('  "locator": "' + locatorStr + '"');
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push('> **Save** the returned `targetVersion`. This is required for the edit step to prevent stale-edit rejection.');
    lines.push('');
    lines.push('> If `mt_apk_read_text` returns `NOT_TEXT_ENTRY`, use `mt_apk_read_zip_bytes` with the same locator to inspect raw bytes.');
    lines.push('');
  }

  // Step C: Apply the edit
  if (resourceMod) {
    lines.push('#### C. Edit the Resource Value');
    lines.push('');
    lines.push('```json');
    lines.push('// mt_apk_edit_resource — apply the resource value change');
    lines.push('{');
    lines.push('  "workspaceId": "<workspaceId>",');
    lines.push('  "editSessionId": "<editSessionId>",');
    lines.push('  "edits": [{');
    lines.push('    "locator": "resource:0x<resourceId>",');
    lines.push('    "variant": "default",');
    lines.push('    "targetVersion": "<targetVersion from step B>",');
    lines.push('    "valueXml": "<modified valueXml — see replacement files below>"');
    lines.push('  }]');
    lines.push('}');
    lines.push('```');
    lines.push('');
  } else {
    lines.push('#### C. Edit the File Content');
    lines.push('');
    lines.push('Use `mt_apk_edit_text` with the appropriate edit mode:');
    lines.push('');

    lines.push('- **`replace_match`** — Replace a specific text match with new content (most common for targeted edits).');
    lines.push('- **`write_target`** — Replace the entire file content (use when you have the full replacement file).');
    lines.push('- **`insert_before_match`** / **`insert_after_match`** — Insert text before/after a match.');
    lines.push('');

    lines.push('```json');
    lines.push('// mt_apk_edit_text — apply the modification');
    lines.push('{');
    lines.push('  "workspaceId": "<workspaceId>",');
    lines.push('  "editSessionId": "<editSessionId>",');
    lines.push('  "edits": [{');
    lines.push('    "mode": "write_target",');
    lines.push('    "matchText": "",');
    lines.push('    "writeText": "<full modified file content — see replacement files below>",');
    lines.push('    "targetVersion": "<targetVersion from step B>"');
    lines.push('  }]');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }

  // ── Diff section (toggle) ──
  if (should('includeDiffs')) {
    var diffSection = buildDiffSection(mod);
    if (diffSection) lines.push(diffSection);
  }

  // ── Replacement files section (full content) (toggle) ──
  if (should('includeFullFiles')) {
    var replSection = buildReplacementFilesSection(mod);
    if (replSection) lines.push(replSection);

    // ── If no replacement files but we have modifiedContent, include it ──
    if (!replSection && mod.modifiedContent && mod.modifiedContent.length > 0) {
      lines.push('#### Complete Modified File Content');
      lines.push('');
      lines.push('```');
      lines.push(truncateForDisplay(mod.modifiedContent, 50000));
      lines.push('```');
      lines.push('');
    }
  }

  // Step D: Check the edit  (RESPECT includeValidation)
  if (should('includeValidation')) {
    lines.push('#### D. Verify the Edit Session');
    lines.push('');
    lines.push('```json');
    lines.push('// mt_apk_edit_check — verify edits compile correctly');
    lines.push('{');
    lines.push('  "workspaceId": "<workspaceId>",');
    lines.push('  "editSessionId": "<editSessionId>",');
    lines.push('  "runBuildChecks": true');
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push('> If `failedCount > 0`, review the failures and fix the edit before building. Do not proceed to build if there are compilation errors.');
    lines.push('');
  } else {
    lines.push('#### D. (Validation skipped per your SKILL.md options)');
    lines.push('');
  }

  // ── Frida script (optional, alongside static edit) (toggle) ──
  if (should('includeFrida')) {
    var fridaSection = buildFridaSection(mod, true);
    if (fridaSection) lines.push(fridaSection);
  }

  return lines.join('\n');
}

export function buildModSteps(selectedMods, manifest, apkName, opts) {
  var sections = [];
  var packageName = (manifest && manifest.package) || '<package>';
  var stepNum = 4; // Steps 1-3 are always MCP setup

  opts = opts || {};
  function should(key) { return opts[key] !== false; }

  // Group mods by category for organized presentation
  var grouped = {};
  var order = [];
  for (var i = 0; i < selectedMods.length; i++) {
    var mod = selectedMods[i];
    var cat = mod.category || 'features';
    if (!grouped[cat]) { grouped[cat] = []; order.push(cat); }
    grouped[cat].push(mod);
  }

  for (var oi = 0; oi < order.length; oi++) {
    var category = order[oi];
    var mods = grouped[category];
    var catInfo = AI_CATEGORIES[category] || AI_CATEGORIES.features;

    sections.push('## Step ' + stepNum + ' — Category: ' + catInfo.name);
    sections.push('');
    sections.push('> Applying ' + mods.length + ' modification(s) in the `' + category + '` category. Follow each sub-step sequentially.');
    sections.push('');

    for (var mi = 0; mi < mods.length; mi++) {
      var subStep = String(stepNum) + '.' + String(mi + 1);
      sections.push(buildModStep(mods[mi], subStep, manifest, apkName, opts));
      sections.push('');
      sections.push('---');
      sections.push('');
    }

    stepNum++;
  }

  // Final build step (always useful)
  sections.push('## Step ' + stepNum + ' — Build the Modified APK');
  sections.push('');
  sections.push('After all modifications have been applied and verified with `mt_apk_edit_check`, build the final signed APK:');
  sections.push('');
  sections.push('```json');
  sections.push('// mt_apk_build — build the signed output APK');
  sections.push('{');
  sections.push('  "workspaceId": "<workspaceId>",');
  sections.push('  "editSessionId": "<editSessionId>",');
  sections.push('  "outputName": "' + packageName.replace(/[^a-zA-Z0-9._-]/g, '_') + '_modified.apk",');
  sections.push('  "overwrite": true');
  sections.push('}');
  sections.push('```');
  sections.push('');
  sections.push('> The output APK will be signed with the key configured in APK MCP settings. The source APK is never modified.');
  sections.push('');

  stepNum++;

  // Install + verify step  (RESPECT includeValidation)
  if (should('includeValidation')) {
    sections.push('## Step ' + stepNum + ' — Install and Verify on Device');
    sections.push('');
    sections.push('> **Requires:** Android MCP server connected and a device/emulator available.');
    sections.push('');
    sections.push('1. **Uninstall the original app** (if already installed):');
    sections.push('   - Use `app_uninstall` with package `' + packageName + '`.');
    sections.push('   - This is required because the modified APK will have a different signing key than the original.');
    sections.push('');
    sections.push('2. **Install the modified APK:**');
    sections.push('   - Use `app_install` with the path to the built APK from Step ' + (stepNum - 1) + '.');
    sections.push('');
    sections.push('3. **Launch the app:**');
    sections.push('   - Use `app_start` with package `' + packageName + '`.');
    sections.push('   - Consider using `start_session` first for faster screenshot/UI tools.');
    sections.push('');
    sections.push('4. **Verify modifications are active:**');
    sections.push('   - Take a `screenshot` to visually confirm changes.');
    sections.push('   - Use `ui_dump` and `ui_find_element` to check for expected UI states.');
    sections.push('   - Use `app_current` to confirm the app is in the foreground.');
    sections.push('   - If a Frida hook was provided, attach Frida via `shell_exec` and verify runtime behavior.');
    sections.push('');
  } else {
    sections.push('## Step ' + stepNum + ' — Install and Verify on Device (Validation skipped)');
    sections.push('');
    sections.push('> **Validation & verification steps were disabled in SKILL.md options.**');
    sections.push('> You can still run the basic install steps if desired:');
    sections.push('');
    sections.push('1. `app_uninstall` (optional but recommended for signature mismatch)');
    sections.push('2. `app_install` the built APK');
    sections.push('3. `app_start` the package');
    sections.push('');
  }

  return sections.join('\n');
}
