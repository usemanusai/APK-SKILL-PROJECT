// ui/skill-md/mobile-tutorial.js
// Generates a screenshot-rich, mobile-native SKILL.md in the Gemini + MT Manager style.
// NOW INCLUDES CLEAR SERVER-SIDE ANALYSIS + BANNERS.

import { validateModsAgainstAPK } from '../apk-parser.js';

function makeCounter() {
  return {
    step: 0,
    time: 120,
    images: 0,
    next: function() { this.step++; return this.step; },
    tick: function() {
      this.images++;
      var t = String(this.time);
      while (t.length < 4) t = '0' + t;
      this.time += 20;
      return t;
    },
  };
}

function joinLines(lines) {
  return lines.filter(function(l) { return l !== null; }).join('\n');
}

function headerRow(label, value) {
  return '| **' + label + '** | ' + value + ' |';
}

function buildHeader(apk, manifest, selectedMods, safeMods, unsafeMods) {
  var packageName = (manifest && manifest.package) || 'unknown.package';
  var versionName = (manifest && manifest.versionName) || '?';
  var versionCode = (manifest && manifest.versionCode) || '?';
  var apkName = apk ? (apk.originalName || apk.name) : 'Unknown.apk';
  var timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  // === NEW: Server analysis for mobile style ===
  var serverMods = safeMods.filter(function(m) { return (m.modSide || 'client') !== 'client'; });
  var hasServerSide = serverMods.length > 0;

  var headerLines = [
    '# SKILL.md — Use Gemini AI + MT Manager to Patch an Android APK (No Root)',
    '',

    '> A standalone, self-contained procedure for identifying and removing unwanted UI elements, bypassing dialogs, or applying client-side modifications to a target Android application by combining the analytical power of the Gemini AI assistant with the on-device APK editing capabilities of MT Manager. No root access is required.',

    '',

    '---',
    '',

    '## Target Package',

    '',

    '| Field | Value |',
    '|-------|-------|',
    headerRow('Package Name', '`' + packageName + '`'),
    headerRow('Version', versionName + ' (code: ' + versionCode + ')'),
    headerRow('Original File', '`' + apkName + '`'),
    headerRow('Total Modifications Selected', String(selectedMods.length)),
    headerRow('Install-Safe Mods', String(safeMods.length)),
    unsafeMods.length > 0 ? headerRow('Blocked Mods (excluded)', String(unsafeMods.length)) : null,
  ];

  if (hasServerSide) {
    headerLines.push(headerRow('Server-Side Mods Required', '**YES** (' + serverMods.length + ' of ' + safeMods.length + ') — see dedicated Server Strategy section'));
  } else {
    headerLines.push(headerRow('Server-Side Mods Required', 'No (purely client-side)'));
  }

  headerLines.push(headerRow('Generated', timestamp));
  headerLines.push('');
  headerLines.push('---');
  headerLines.push('');

  return joinLines(headerLines);
}

function buildSkillDescription(selectedMods) {
  var labels = selectedMods.map(function(m) { return m.label; }).join(', ');
  return joinLines([
    '## Skill Description and Trigger Words',
    '',
    '**Description:**',
    'This skill guides an AI agent through the complete, end-to-end workflow of analyzing an Android APK on a mobile device, identifying the source of a target behavior (such as a login dialog, promotional popup, rate-limit prompt, or in-game limit), and patching the APK on-device using Gemini AI for reasoning and MT Manager for byte-level APK manipulation. The agent will learn how to extract an `AndroidManifest.xml` from a packaged APK, send it to Gemini as context, receive a hypothesis about which Java/Kotlin class or smali method drives the target behavior, navigate the multi-dex smali tree inside MT Manager\'s `Dex Editor+`, paste relevant code back into Gemini for confirmation, apply a recommended remediation strategy (commenting out, neutralizing, or replacing an `invoke-static` / `invoke-virtual` line or a config value), save the file, recompile, sign, and reinstall the patched APK. The skill also covers troubleshooting, dynamic wait conditions based on file size and completion prompts, and a complete matrix of common error states and their resolutions.',
    '',
    '**Trigger Words:**',
    '- "mod an Android app without root"',
    '- "patch an APK using Gemini AI"',
    '- "remove a dialog from an Android app"',
    '- "use MT Manager to modify an APK"',
    '- "find and comment out smali code"',
    '- "AI-assisted APK reverse engineering"',
    '- "edit classes.dex on Android"',
    '- "remove unwanted popup from Android app"',
    '- "Gemini AI for Android reverse engineering"',
    '- "MT Manager Dex Editor+ workflow"',
    '- "how to find which activity launches a dialog"',
    '- "AndroidManifest.xml analysis with AI"',
    '- "bypass login screen in APK"',
    '- "smali code analysis with AI assistant"',
    '- "recompile and sign APK on Android"',
    '- "no-root APK modification"',
    '- "comment out invoke-static in smali"',
    '- "neutralize method in smali"',
    '- "extract AndroidManifest from APK"',
    '',
    labels ? '**Selected Modifications for This Run:** ' + labels : null,
    labels ? '' : null,
    '---',
    '',
  ]);
}

function buildPrerequisites() {
  return joinLines([
    '## Prerequisites and Tool Inventory',
    '',
    'Before starting this workflow, verify that the following tools are installed and accessible on the target Android device. None require root access; all run as standard user-space applications.',
    '',
    '1. **MT Manager** (latest stable version, 2.x or newer). A dual-pane file manager and APK editor for Android. It can decompile APK files in place, browse their internal structure (`META-INF/`, `res/`, `AndroidManifest.xml`, `classes.dex`, `classes2.dex`, `resources.arsc`), edit smali code in `Dex Editor+`, recompile the APK, and sign the result with a built-in debug keystore. If not installed, obtain it from its official distribution channel.',
    '',
    '2. **The Gemini app** (or `gemini.google.com` in any browser). Requires the Gemini Flash model variant, which is the default in the free tier. The chat interface shows "Gemini Flash" at the top-left, an "Ask Gemini" prompt at the bottom-right, and a paper-plane send button.',
    '',
    '3. **The target APK file** stored locally on the device, typically in `/storage/emulated/0/Download/`. The APK must be readable by MT Manager. If obtained from a third-party source, grant "Install unknown apps" permission to MT Manager.',
    '',
    '4. **A screenshot utility**. Any built-in Android screenshot tool (power + volume-down) is sufficient. Screenshots visually communicate the target UI element to Gemini.',
    '',
    '5. **Sufficient free storage**. At least 500 MB free, because decompiling an APK temporarily doubles its on-disk size.',
    '',
    '6. **Android version 10 or higher**. Tested on Android 14, but compatible with Android 5.0+ where MT Manager runs.',
    '',
    '---',
    '',
  ]);
}

function step(title, body, c) {
  return joinLines([
    '#### Step ' + c.next() + ': ' + title,
    '',
    body,
    '',
    '![Screenshot](step_t' + c.tick() + '.png)',
    '',
  ]);
}

function buildPhase1(c) {
  return joinLines([
    '### Phase 1: Identify and Document the Problem',
    '',
    'Establish a clear description of the unwanted UI element or behavior. This becomes the contract the rest of the workflow satisfies.',
    '',
    step('Open the Gemini App', 'Locate the Gemini app icon and tap it. Dismiss any onboarding to reach the main chat view. Confirm the header shows "Gemini Flash".', c),
    step('Describe the Problem in Plain Language', 'In the "Ask Gemini" prompt, type a plain-language description of the target behavior. Do not paste code yet. Example: "I have an Android app that shows a login dialog every time it launches. I want to remove this dialog so the app goes straight to its main screen. I will send you the AndroidManifest.xml and relevant smali code."', c),
    step('Screenshot the Target UI Element', 'Switch to the target app and trigger the unwanted element so it is visible. Capture a screenshot that includes the entire dialog or UI element plus any buttons or text. This screenshot will be attached to the next Gemini message as visual evidence.', c),
    step('Send the Screenshot to Gemini', 'Return to Gemini. Tap the attachment icon (+ or paperclip), select the screenshot, add a caption such as "This is what I want to remove," and tap the paper-plane send button at the bottom-right.', c),
  ]);
}

function buildPhase2(c) {
  return joinLines([
    '### Phase 2: Send the AndroidManifest.xml to Gemini',
    '',
    'The manifest declares every component, the launch activity, permissions, and metadata. Sending it gives Gemini a map of the app.',
    '',
    step('Extract AndroidManifest.xml from the APK', 'Open MT Manager and navigate to the target APK directory. Long-press the APK, tap **View** (not Install). MT Manager displays the APK\'s internal structure as a virtual folder. Locate `AndroidManifest.xml`, tap it, then tap **View** or **Open** (choose plain text). Tap **Select all**, then **Copy**.', c),
    step('Paste the Manifest into Gemini and Submit', 'Return to Gemini. Long-press the prompt field, select **Paste**. Add an instruction above the XML: "Here is the AndroidManifest.xml. Based on the screenshot I sent and this manifest, tell me where this behavior is most likely triggered." Tap **Ask Gemini**.', c),
    step('Read Gemini\'s Hypothesis', 'Gemini will respond with likely trigger locations — typically the `MainActivity` (launch activity with MAIN/LAUNCHER intent filter) or an `Application` subclass declared on the `<application>` tag. Record the suggested class name.', c),
    step('Request Step-by-Step Instructions', 'If Gemini did not provide numbered steps, follow up: "Give me step-by-step instructions for how to find and remove this in MT Manager." Gemini will produce a numbered plan.', c),
  ]);
}

function buildPhase3(c) {
  return joinLines([
    '### Phase 3: Open the APK and Navigate to the Target Class in MT Manager',
    '',
    step('Open MT Manager and Navigate to the APK', 'Launch MT Manager. Use the file browser pane to navigate to the directory containing the target APK. The path bar shows the current directory (e.g., `/storage/emulated/0/Download/`). Long-press the APK.', c),
    step('View the APK Internally and Select classes.dex', 'From the context menu, tap **View**. MT Manager shows the internal structure: `META-INF/`, `res/`, `AndroidManifest.xml`, `classes.dex`, `classes2.dex`, `resources.arsc`. If multidex, a dialog lists DEX files. Start with `classes.dex` (the launch activity is usually here). Tap **OK**.', c),
    step('Open classes.dex in Dex Editor+', 'After tapping OK, MT Manager opens `Dex Editor+`. The left pane shows the package tree; the right pane shows smali code. Use the tree to navigate to the package and class Gemini identified.', c),
  ]);
}

function buildPhase4(c) {
  return joinLines([
    '### Phase 4: Find the Triggering Code and Confirm with Gemini',
    '',
    step('Locate the Target Method in smali', 'In `Dex Editor+`, open the target class and scroll to the method Gemini identified (often `onCreate()` for startup dialogs). Look for `invoke-static`, `invoke-virtual`, or `invoke-direct` calls that match the behavior name.', c),
    step('Copy the Method Body to Gemini', 'Long-press the first line of the target method, drag to select the entire method body up to `.end method`, then tap **Copy**. Switch to Gemini, paste into the prompt, and ask: "I found this method. Is this where the behavior is triggered? Which specific line should I modify?" Tap **Ask Gemini**.', c),
    step('Confirm Gemini Identifies the Trigger Line', 'Wait for Gemini to name the exact line. Do not edit until Gemini explicitly identifies the triggering instruction. This prevents breaking unrelated code.', c),
  ]);
}

function buildModSection(mod, idx, c) {
  var optionA = mod.optionA || ('Comment out the single triggering `invoke-*` line in `' + (mod.targetFile || 'target.smali') + '` by adding `# ` at the start of the line.');
  var optionB = mod.optionB || ('Neutralize the method body by inserting `return-void` immediately after `.prologue` / `.locals` so the method exists but does nothing.');
  var side = (mod.modSide || 'client');
  var sideNote = side === 'server' ? ' **(SERVER-SIDE — requires MITM or Frida network hook)**' : (side === 'both' ? ' **(CLIENT + SERVER)**' : '');

  var lines = [
    '#### Step ' + c.next() + ': Apply Mod #' + (idx + 1) + ' — ' + mod.label + sideNote,
    '',
  ];
  if (mod.description) {
    lines.push('> ' + mod.description);
    lines.push('');
  }
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(headerRow('Target File', '`' + (mod.targetFile || 'N/A') + '`'));
  lines.push(headerRow('Side', '`' + side + '`' + (side !== 'client' ? ' — see Server Strategy section' : '')));
  if (mod.lineRange) lines.push(headerRow('Line Range', '`' + mod.lineRange + '`'));
  if (mod.difficulty) lines.push(headerRow('Difficulty', '`' + mod.difficulty + '`'));
  lines.push('');

  if (mod.instructions) {
    lines.push('**Gemini Instructions:**');
    lines.push('```');
    lines.push(mod.instructions);
    lines.push('```');
    lines.push('');
  }
  if (mod.diff) {
    lines.push('**Reference Diff:**');
    lines.push('```diff');
    lines.push(mod.diff);
    lines.push('```');
    lines.push('');
  }

  if (side !== 'client') {
    lines.push('**⚠️ Server-side component required:**');
    lines.push('This mod involves network/purchase/server validation. You must also:');
    lines.push('- Use mitmproxy / Frida to fake the server response, OR');
    lines.push('- Redirect the base URL to a mock server you control.');
    lines.push('See the "Server-Side Bypass Strategy" section at the top of this document.');
    lines.push('');
  }

  lines.push('**Option A (recommended first try):** ' + optionA);
  lines.push('');
  lines.push('**Option B (if Option A leaves side effects):** ' + optionB);
  lines.push('');
  lines.push('In `Dex Editor+`, tap the pencil icon to enter edit mode. Apply the chosen change. **Do not** comment out `.annotation` lines or `.end annotation` boundaries — only modify code instructions.');
  lines.push('');
  lines.push('![Apply comment or neutralize](step_t' + c.tick() + '.png)');
  lines.push('');

  if (mod.fridaScript && mod.fridaScript.length > 10) {
    lines.push('**Optional Frida verification hook:**');
    lines.push('```javascript');
    lines.push(mod.fridaScript);
    lines.push('```');
    lines.push('');
  }

  if (mod.fileChanges && mod.fileChanges.length > 0) {
    mod.fileChanges.forEach(function(change) {
      if (!change.content) return;
      var ext = '';
      var lp = (change.path || '').toLowerCase();
      if (lp.indexOf('.json') >= 0) ext = 'json';
      else if (lp.indexOf('.xml') >= 0) ext = 'xml';
      else if (lp.indexOf('.smali') >= 0) ext = 'smali';
      else if (lp.indexOf('.js') >= 0) ext = 'javascript';
      else if (lp.indexOf('.properties') >= 0) ext = 'properties';
      var truncated = change.content.length > 12000 ? change.content.slice(0, 12000) + '\n\n... (truncated for brevity) ...' : change.content;
      lines.push('**Complete replacement content for `' + change.path + '`**');
      lines.push('```' + ext);
      lines.push(truncated);
      lines.push('```');
      lines.push('');
    });
  }
  return joinLines(lines);
}

function buildPhase5(selectedMods, c) {
  var sections = selectedMods.map(function(mod, idx) {
    return buildModSection(mod, idx, c) + (idx < selectedMods.length - 1 ? '\n---\n' : '');
  });
  return joinLines([
    '### Phase 5: Apply the Recommended Fix(es)',
    '',
  ]) + '\n' + sections.join('\n');
}

function buildPhase6(manifest, c, includeValidation) {
  if (!includeValidation) {
    return joinLines([
      '### Phase 6: Recompile and Sign (Verification disabled)',
      '',
      step('Sign and Save the Patched APK', 'After saving all edited files in `Dex Editor+`, return to MT Manager\'s file browser. Long-press the original APK, tap **Sign and save** (or **Function → Sign APK**). Choose the default MT Manager self-signed keystore and tap **OK**. Wait for a new `*_signed.apk` file to appear in the same directory.', c),
      '',
      '> **Note:** Post-build verification steps were turned off in your SKILL.md options. You can manually install and test the APK if you want.',
    ]);
  }

  return joinLines([
    '### Phase 6: Recompile, Sign, Install, and Verify',
    '',
    step('Sign and Save the Patched APK', 'After saving all edited files in `Dex Editor+`, return to MT Manager\'s file browser. Long-press the original APK, tap **Sign and save** (or **Function → Sign APK**). Choose the default MT Manager self-signed keystore and tap **OK**. Wait for a new `*_signed.apk` file to appear in the same directory.', c),
    step('Install the Patched APK', 'Tap the new `_signed.apk`. If prompted, enable "Allow from this source" for MT Manager, then tap **Install**. If an existing version is installed, tap **Update** or **Install anyway**. Because the patched APK is signed with a different key than the original vendor signature, you may need to uninstall the original app first.', c),
    step('Launch and Verify', 'Tap **Open** on the install success screen or launch from the home screen. Confirm the target behavior is gone. If the app crashes, undo your edit in `Dex Editor+` and try Option B instead of Option A.', c),
    step('Confirm the Fix with Gemini', 'Return to Gemini and send a closing message: "Thanks, it works. The behavior is gone." This completes the AI-assisted portion of the workflow.', c),
  ]);
}

function buildPhase7(c) {
  return joinLines([
    '### Phase 7: Quick Reference — Extracting AndroidManifest.xml from Any APK',
    '',
    step('Open the APK in MT Manager', 'Navigate to the APK file, long-press it, tap **View**. The internal structure always includes `META-INF/`, `res/`, `AndroidManifest.xml`, `classes.dex` (and possibly `classes2.dex`, etc.), and `resources.arsc`.', c),
    step('Tap AndroidManifest.xml to Open It', 'Locate `AndroidManifest.xml` in the list and tap it. If prompted, choose **Text** — MT Manager decompiles binary XML into readable XML.', c),
    step('Select All and Copy', 'Tap the menu (three dots), choose **Select all**, then **Copy**. The manifest is now on the clipboard for pasting into Gemini.', c),
  ]);
}

function buildTroubleshootingMatrix() {
  return joinLines([
    '## Troubleshooting Matrix',
    '',
    '| Symptom | Probable Cause | Resolution |',
    '|---------|----------------|------------|',
    '| MT Manager shows "Failed to open APK" when tapping View | Corrupted/partial APK or scoped-storage issue | Re-download the APK and move it to `/storage/emulated/0/Download/` before opening. |',
    '| Dex Editor+ shows "Decompiling..." indefinitely | Large DEX or low RAM | Close background apps; try `classes2.dex` or Quick Edit mode. |',
    '| Edited classes.dex fails to save with "Smali syntax error" | Commented out `.annotation` line or unbalanced comment | Re-open and ensure only code instructions are commented. Restore annotations. |',
    '| Patched APK installs but crashes on launch | Wrong line modified or side effects removed | Undo edit; try Option B neutralization instead of Option A. |',
    '| Patched APK installs but behavior still appears | Trigger located elsewhere (Application class, receiver, classes2.dex) | Repeat workflow targeting `Application` `onCreate()` or secondary DEX. |',
    '| Sign and save fails with "Keystore error" | Default keystore missing | MT Manager Settings → Keystore management → Create new keystore. |',
    '| Android refuses install with "App not installed" | Signature mismatch with already-installed original | Uninstall original app first, then install patched APK. |',
    '| Gemini refuses modification help | Safety filter triggered | Reframe as an educational/ownership question: "I am studying this APK\'s structure." |',
    '| No `invoke-static` in target method | Trigger uses `invoke-virtual` or `invoke-direct` | Send full method body and ask: "Which invoke-* line triggers this?" |',
    '| Commented-out line is restored after reopening | MT Manager auto-recovery reverted edit | Disable auto-recovery or explicitly tap Save before closing Dex Editor+. |',
    '',
    '---',
    '',
  ]);
}

function buildDynamicWaits() {
  return joinLines([
    '## Dynamic Wait Conditions Reference',
    '',
    'The following operations have variable durations. Wait by polling for a completion signal, not by sleeping for a fixed duration.',
    '',
    '| Operation | Completion Signal | Typical Duration |',
    '|-----------|-------------------|------------------|',
    '| Gemini processes manifest + screenshot submission | Response text begins streaming | 5–15 s (small manifests); 20–40 s (large manifests) |',
    '| Gemini processes smali snippet submission | Response text begins streaming | 10–30 s depending on snippet length |',
    '| MT Manager opens a large APK in View mode | Internal folder structure appears | 2–10 s |',
    '| Dex Editor+ decompiles classes.dex | Class tree appears on the left | 5–30 s depending on DEX size |',
    '| MT Manager signs and saves patched APK | New `_signed.apk` appears in directory | 10–60 s for small APKs; 3–5 min for large game APKs |',
    '| Android installs patched APK | "App installed" screen appears | 10–30 s for small APKs; 1–2 min for large APKs |',
    '',
    'For all other operations (tapping a button, opening a menu, switching apps), no wait is needed — the action takes effect immediately.',
    '',
    '---',
    '',
  ]);
}

function buildOutOfScopeAndWarnings() {
  return joinLines([
    '## Out-of-Scope Notes',
    '',
    '1. **Desktop-based reverse engineering with JADX-GUI.** JADX-GUI is faster for browsing large codebases but requires a desktop computer. This workflow uses MT Manager\'s `Dex Editor+` (smali) entirely on Android.',
    '2. **Server-side authentication / unlimited-account tools.** Some apps enforce server-side checks that cannot be bypassed by client patching.',
    '3. **Contacting app developers.** If the target element is a legitimate paid feature wall, contact the developer\'s support email instead.',
    '4. **Anti-tamper protections.** Apps protected by DexGuard, Allatori, Bangcle, etc. may require specialized unpacking tools.',
    '5. **Server-side rate limiting and license verification.** Client patches cannot permanently remove dialogs triggered by server responses.',
    '',
    '## Warnings and Ethical Use',
    '',
    'This skill is intended for educational purposes and for analyzing apps that you own or have explicit permission to modify. Legitimate use cases include removing broken promotional popups from apps you paid for, bypassing login dialogs in personal test projects, analyzing open-source APKs for learning, and patching abandoned apps to remove broken UI that prevents normal use.',
    '',
    'Illegitimate use cases — which this skill does not support — include removing license verification or in-app purchase checks from commercial apps without payment, bypassing authentication in banking/healthcare/government apps, modifying apps to remove safety features, and distributing patched commercial APKs to third parties.',
    '',
    '---',
    '',
  ]);
}

function buildFileInventory(c) {
  var rows = [];
  for (var i = 0; i < c.images; i++) {
    var t = String(120 + i * 20);
    while (t.length < 4) t = '0' + t;
    rows.push('| `step_t' + t + '.png` | Annotated screenshot #' + (i + 1) + ' | Placeholder — capture during workflow execution |');
  }
  return joinLines([
    '## File Inventory',
    '',
    'All screenshot files referenced in this document are expected to be captured during execution and stored in the same directory as this `SKILL.md`. The following placeholder files are referenced:',
    '',
    '| File | Phase | Description |',
    '|------|-------|-------------|',
  ].concat(rows).concat([
    '',
    '> If any screenshot is missing, the workflow can still proceed using the text descriptions alone, but visual annotations will be unavailable.',
    '',
    '*Generated by APK Structure Analyzer on ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC*',
    '',
  ]));
}

export function generateMobileTutorialSkillMd(options) {
  var apk = options.apk;
  var manifest = options.manifest;
  var selectedMods = options.selectedMods || [];
  var opts = options.options || {};
  function should(key) { return opts[key] !== false; }

  var validation = validateModsAgainstAPK(selectedMods, apk.allFiles, apk.editablePaths || []);
  var safeMods = validation.safeMods;
  var unsafeMods = validation.unsafeMods;
  var c = makeCounter();

  // === NEW: Quick server-side banner for mobile style ===
  var serverMods = safeMods.filter(function(m) { return (m.modSide || 'client') !== 'client'; });
  var hasServerSide = serverMods.length > 0;

  var parts = [
    buildHeader(apk, manifest, selectedMods, safeMods, unsafeMods),
    buildSkillDescription(selectedMods),
    buildPrerequisites(),
  ];

  if (hasServerSide) {
    parts.push(joinLines([
      '## ⚠️ Server-Side Bypass Required',
      '',
      'This APK contains network, purchase, auth, or server-validation logic.',
      'The following modifications **cannot** be completed with client-side edits alone:',
      '',
      serverMods.map(function(m) { return '- **' + m.label + '** — ' + (m.description || ''); }).join('\n'),
      '',
      '**You must combine the client edits in this document with one of these server strategies:**',
      '- MITM proxy (mitmproxy) to rewrite API responses',
      '- Frida hook on network layer to fake server replies',
      '- Redirect base URL to a mock server you control',
      '',
      'See per-mod steps below for exact server bypass instructions.',
      '',
      '---',
      '',
    ]));
  }

  if (should('includeSetup')) {
    parts.push(buildPhase1(c));
    parts.push(buildPhase2(c));
    parts.push(buildPhase3(c));
    parts.push(buildPhase4(c));
  }

  parts.push(buildPhase5(safeMods, c));

  if (should('includeSetup')) {
    parts.push(buildPhase6(manifest, c, should('includeValidation')));
    if (should('includeValidation')) {
      parts.push(buildPhase7(c));
    }
  }

  if (should('includeTroubleshooting')) parts.push(buildTroubleshootingMatrix());
  if (should('includeDynamicWaits')) parts.push(buildDynamicWaits());
  if (should('includeWarnings')) parts.push(buildOutOfScopeAndWarnings());
  if (should('includeInventory') || should('mobileScreenshots')) parts.push(buildFileInventory(c));

  return parts.join('\n');
}

export function getMobileSkillMdFilename(manifest) {
  var pkg = (manifest && manifest.package) || 'apk';
  var safe = pkg.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe + '_Gemini_MT_Manager_SKILL.md';
}

export function downloadMobileSkillMd(content, filename) {
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
    console.error('downloadMobileSkillMd failed:', e);
    try {
      var dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
      window.open(dataUrl, '_blank');
    } catch (_) {}
  }
}

// IMPORTANT:
// runSkillMdGenerationWorkflow is NOT defined or exported from this file.
// It lives in ./skillmd-workflow.js
// The canonical re-export happens in ./generator.js so that
// ui/apk-tab/mods-view.js and other consumers can continue to import it from
// '../skill-md/generator.js' without breaking.
