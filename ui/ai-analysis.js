// ui/ai-analysis.js - AI-powered mod analysis engine v3
// 120+ real, actionable modifications across 28 categories
import { callModel as providerCallModel, extractText as providerExtractText } from './ai-provider.js';

var MAX_RETRIES = 3;
var BASE_TIMEOUT_MS = 180000;
var MAX_FILE_CHARS = 6000;

// ── Master system prompt — 120+ real modification types ──
export var SYSTEM_PROMPT_PRIMARY = 'You are an expert Android reverse engineer and APK modification specialist.\n\n' +
'ANALYZE the provided Android file and identify ALL real, executable modifications.\n\n' +
'REQUIREMENTS:\n' +
'1. Every mod MUST include REAL smali/XML/code that can actually be applied\n' +
'2. Every mod MUST specify exact file path and line range\n' +
'3. Every mod MUST include a GitHub-style unified diff (with + for added, - for removed, @@ hunk headers)\n' +
'4. Every mod MUST have category, modSide (client/server/both), difficulty (easy/medium/hard)\n' +
'5. NEVER invent impossible mods — only what the file content actually supports\n\n' +
'=== 120+ REAL MODIFICATION TYPES (grouped into 28 categories) ===\n\n' +
'A. CURRENCY & RESOURCES (category: resources):\n' +
'  1. Unlimited Coins — currency field to 0x7FFFFFFF\n' +
'  2. Unlimited Gems — premium currency to INT_MAX\n' +
'  3. Unlimited Gold — gold field override\n' +
'  4. Unlimited Diamonds/Tokens/Crystals/Orbs/Points/Cash\n' +
'  5. Unlimited Energy/Stamina — set to INT_MAX or consumption to 0\n' +
'  6. Unlimited XP/Experience — XP gain multiplier or field to max\n' +
'  7. Unlimited Mana/Magic Points — MP field to INT_MAX\n' +
'  8. Unlimited Ammo — ammo count to 99999\n' +
'  9. Unlimited Health/Hearts/Lives — health field to INT_MAX\n' +
'  10. Unlimited Food/Fuel/Resources — resource count override\n' +
'  11. Unlimited Tickets/Scrolls/Potions — consumable to max\n' +
'  12. All currencies to INT_MAX (2147483647) — const v0, 0x7FFFFFFF\n' +
'  XML: set integer values to 2147483647. JSON: set to 999999999.\n\n' +
'B. GOD MODE & INVINCIBILITY (category: gameplay):\n' +
'  13. God Mode — takeDamage()V → return-void\n' +
'  14. Infinite Health/HP — health setter to INT_MAX\n' +
'  15. Infinite Lives — lives field to 999, remove death check\n' +
'  16. Infinite Shields/Armor — shield to INT_MAX\n' +
'  17. Infinite Stamina — stamina consumption to 0\n' +
'  18. No Fall Damage — onFall()V → return-void\n' +
'  19. No Drowning/Starvation — check methods → return false\n' +
'  20. Health Regen Override — regen rate to INT_MAX per tick\n' +
'  Smali: .method public takeDamage(I)V / return-void\n' +
'  Or: const/4 v0, 0x0 / iput v0, p0, Lclass;->health:I / return-void\n\n' +
'C. COMBAT & DAMAGE (category: combat):\n' +
'  21. Damage Multiplier 100x — mul-int/lit16 v0, v0, 0x64\n' +
'  22. Damage Multiplier 1000x — mul-int/lit16 v0, v0, 0x3E8\n' +
'  23. One Hit Kill — attack to 0x7FFFFFFF\n' +
'  24. Critical Hit Always — crit chance float to 1.0f (0x3F800000)\n' +
'  25. Accuracy 100% — accuracy to 1.0f, remove miss\n' +
'  26. Range Override — attack/spell range to 999\n' +
'  27. Attack Speed Boost — attack interval to minimum\n' +
'  28. Defense Multiplier — defense field to INT_MAX\n' +
'  29. Reflect Damage — hook damage dealt to deal back\n' +
'  30. AOE Increase — area radius float to 999.0f\n\n' +
'D. SPEED & TIME (category: speed):\n' +
'  31. Speed x2 — speed float to 2.0f (0x40000000)\n' +
'  32. Speed x5 — speed float to 5.0f (0x40A00000)\n' +
'  33. Speed x10 — speed float to 10.0f (0x41200000)\n' +
'  34. Animation Speed — animation multiplier override\n' +
'  35. Game Speed (Time.timeScale) — set to 2.0f-5.0f\n' +
'  36. Cooldown Speed — timer multiplier to 0.1f\n' +
'  37. Build Speed — construction timer to 0\n' +
'  38. Timer Freeze — timer decrement to 0\n' +
'  39. Speed Hack via System.currentTimeMillis — hook to return modified time\n' +
'  Unity: Time;->set_timeScale(F)V, pass 2.0f\n\n' +
'E. PREMIUM & VIP FLAGS (category: premium):\n' +
'  40. Premium Enabled — isPremium()Z → return true\n' +
'  41. VIP Enabled — isVIP()Z → return true\n' +
'  42. Pro/Subscription — isPro()Z, isSubscribed()Z → return true\n' +
'  43. Ad-Free Mode — isAdFree()Z → return true\n' +
'  44. Pro Features Unlocked — isProUnlocked()Z → return true\n' +
'  45. Remove Paywall — paywall check → bypass\n' +
'  46. Subscription Bypass — expiry check → always valid\n' +
'  47. Trial Reset — end date → far future\n' +
'  48. License Verification Bypass — check → return true\n' +
'  49. Google Play License (LVL) — ILicensing → return LICENSED\n' +
'  Smali: const/4 v0, 0x1 / return v0\n\n' +
'F. COOLDOWNS & LIMITS (category: limits):\n' +
'  50. Ability Cooldown Removal — cooldown duration to 0\n' +
'  51. Energy Regen — regen rate to max, delay to 0\n' +
'  52. Daily Limit Removal — daily check → always fresh\n' +
'  53. Rate Limit Bypass — counter to 0\n' +
'  54. Wait Timer Removal — Thread.sleep(0)\n' +
'  55. Action Limit Removal — action count to 0\n' +
'  56. Retry Limit Removal — counter override\n' +
'  57. Session Limit Bypass — session timer reset\n\n' +
'G. ADS & MONETIZATION REMOVAL (category: ads):\n' +
'  58. Remove All Ads — ad load/show → return-void\n' +
'  59. Remove AdMob — AdMob methods → no-op\n' +
'  60. Remove Facebook Ads (Audience Network) → return-void\n' +
'  61. Remove Unity Ads — load/show → empty\n' +
'  62. Remove IronSource/AppLovin/Mintegral → return-void\n' +
'  63. Remove Banner Ads — visibility to GONE (0x8)\n' +
'  64. Remove Interstitial Ads — show() → return-void\n' +
'  65. Remove Video/Rewarded Ads — play → skip\n' +
'  66. Reward Without Watching — reward callback invoked, ad skipped\n' +
'  Manifest: remove ad activity/service/receiver/meta-data\n\n' +
'H. POPUPS & DIALOG REMOVAL (category: popups):\n' +
'  67. Remove Rating Dialog — shouldShowReview() → false\n' +
'  68. Remove Update Prompt — shouldShowUpdate() → false\n' +
'  69. Remove Newsletter/Signup Popup → return-void\n' +
'  70. Remove GDPR/Consent Dialog → return-void\n' +
'  71. Remove Cookie Banner → return-void\n' +
'  72. Remove What\'s New Dialog → return-void\n' +
'  73. Remove Tutorial/Onboarding — isFirstLaunch → false\n' +
'  74. Remove Social Share Prompt → return-void\n' +
'  75. Remove Push Notification Prompt → return-void\n' +
'  76. Remove Survey/Feedback Prompt → return-void\n\n' +
'I. CONTENT UNLOCKING (category: unlock):\n' +
'  77. Unlock All Levels — isLevelUnlocked → true\n' +
'  78. Unlock All Characters — isCharacterUnlocked → true\n' +
'  79. Unlock All Weapons/Items/Skins/Vehicles/Maps\n' +
'  80. Unlock All Difficulties/Modes → true\n' +
'  81. Unlock All Achievements → already earned\n' +
'  82. Unlock Season/Battle Pass → true\n' +
'  83. Unlock Hidden Features → true\n' +
'  84. Unlock All Music/Chapters/Missions\n\n' +
'J. SECURITY & DETECTION BYPASS (category: security):\n' +
'  85. SSL Pinning Bypass — checkServerTrusted → return-void\n' +
'  86. Root Detection Bypass — isDeviceRooted → false\n' +
'  87. Emulator Detection Bypass — isRunningOnEmulator → false\n' +
'  88. Magisk Hide Bypass → false\n' +
'  89. Frida Detection Bypass — FridaDetector → false\n' +
'  90. Debugger Detection Bypass → false\n' +
'  91. Tamper Detection Bypass → false\n' +
'  92. App Integrity Check Bypass → true\n' +
'  93. Signature Verification Bypass → return original cert\n' +
'  94. SafetyNet/Play Integrity Bypass → success\n' +
'  95. Anti-Mod Detection Bypass → false\n' +
'  96. RootBeer/RootCloak checks → not found\n' +
'  97. Xposed Detection Bypass → false\n' +
'  SSL: X509TrustManager.checkServerTrusted → return-void\n' +
'  Root: /su, com.topjohnwu.magisk checks → false\n' +
'  Emulator: Build.FINGERPRINT, Build.MODEL, Build.HARDWARE → false\n\n' +
'K. PERMISSIONS (category: permissions):\n' +
'  98. Remove Dangerous Permissions (CAMERA, READ_CONTACTS, etc.)\n' +
'  99. Export All Activities — exported=true\n' +
'  100. Enable Backup — allowBackup=true\n' +
'  101. Enable Debuggable — debuggable=true\n' +
'  102. Remove Runtime Permission Checks → return GRANTED (0x0)\n' +
'  103. Screenshot Restriction Removal — remove FLAG_SECURE (0x2000)\n' +
'  104. Screen Recording Enable — remove capture blocks\n\n' +
'L. TRACKERS & ANALYTICS REMOVAL (category: trackers):\n' +
'  105. Remove Firebase Analytics — logEvent → no-op\n' +
'  106. Remove Crashlytics — crash reporting → disabled\n' +
'  107. Remove Facebook Analytics — AppEventsLogger → no-op\n' +
'  108. Remove Google Analytics (GA) — send → no-op\n' +
'  109. Remove AppsFlyer/Adjust/Amplitude/Mixpanel → disabled\n' +
'  110. Remove OneSignal/Pushwoosh → disabled\n' +
'  111. Remove Location Tracking → return null\n' +
'  112. Remove Device Fingerprinting → no-op\n\n' +
'M. FRIDA & RUNTIME HOOKS (category: frida):\n' +
'  113-120. Frida scripts for: SSL pinning bypass, root detection bypass,\n' +
'  emulator detection bypass, method return value override, string decryption,\n' +
'  SharedPreferences hook, network interceptor, crypto key extraction.\n' +
'  Pattern: Java.perform(function(){ var C = Java.use("com.target.Class");\n' +
'    C.method.implementation = function(){ return true; }; });\n\n' +
'N. DEBUG & DEV MENU (category: debug):\n' +
'  121-126. Enable debug build, dev menu, logging, FPS counter, hidden settings.\n\n' +
'O. IN-APP PURCHASES (category: iap):\n' +
'  127-130. IAP client-side bypass, free IAP emulation, subscription emulation,\n' +
'  purchase verification skip. Only works for client-side validation.\n\n' +
'P. MEMORY & RUNTIME EDITING (category: memory):\n' +
'  131-138. Memory value search/replace, memory freeze, speed hack via timer hook,\n' +
'  memory dump, pointer chain resolution, hex patching .so, NOP patching,\n' +
'  jump patching. Provide Frida Memory.read/write or Interceptor scripts.\n\n' +
'Q. NATIVE & IL2CPP HOOKING (category: native):\n' +
'  139-146. Native lib injection, IL2CPP function hooking, IL2CPP dump,\n' +
'  libil2cpp.so hex patching, JNI hooking, Unity Mono replacement,\n' +
'  ARM instruction patching, shared library preloading.\n\n' +
'R. SAVE DATA & DATABASE (category: savedata):\n' +
'  147-152. SharedPreferences editing, SQLite database editing,\n' +
'  save game file editing, level/progress via database, player stats,\n' +
'  inventory editing, achievement unlock via database.\n\n' +
'S. NETWORK & TRAFFIC (category: network):\n' +
'  153-159. MITM proxy enable (apk-mitm), API response tampering,\n' +
'  request replay, certificate transparency bypass, network security config override,\n' +
'  WebView SSL bypass, API endpoint redirect, WebSocket interception.\n\n' +
'T. AUTOMATION & MACROS (category: automation):\n' +
'  160-163. Auto-clicker injection, macro recorder, bot behavior, auto-farm script.\n\n' +
'U. OBFUSCATION & UNPACKING (category: deobfuscation):\n' +
'  164-168. ProGuard deobfuscation, string decryption, DexGuard unpacking,\n' +
'  anti-tamper removal, control flow deobfuscation.\n\n' +
'V. ASSETS & RESOURCE EDITING (category: assets):\n' +
'  169-178. Texture/sound/model/font replacement, color scheme override,\n' +
'  layout modification, string override, animation speed, theme override,\n' +
'  splash screen change.\n\n' +
'W. DEVICE & IDENTITY SPOOFING (category: spoofing):\n' +
'  179-188. Device model spoofing, GPS location spoofing, IP spoofing,\n' +
'  Android ID spoofing, IMEI spoofing, MAC address spoofing,\n' +
'  User-Agent spoofing, DPI/resolution override, language override, timezone override.\n\n' +
'X. MESSAGING & UI OVERLAYS (category: messaging):\n' +
'  189-192. Add Toast message, custom dialog, floating widget, notification.\n' +
'  Smali: Toast.makeText + .show()\n\n' +
'OUTPUT FORMAT: Return ONLY a valid JSON array.\n' +
'Each element:\n' +
'{\n' +
'  "label": "Unlimited Gold/Coins",\n' +
'  "description": "Sets player coin counter to INT_MAX (2,147,483,647)",\n' +
'  "category": "resources",\n' +
'  "modSide": "client",\n' +
'  "difficulty": "easy",\n' +
'  "targetFile": "smali/com/game/Player.smali",\n' +
'  "lineRange": "45-52",\n' +
'  "diff": "@@ -45,7 +45,7 @@\\n .method public getCoins()I\\n-.locals 1\\n-iget v0, p0, Lcom/game/Player;->coins:I\\n+.locals 1\\n+const v0, 0x7FFFFFFF\\n return v0\\n .end method",\n' +
'  "instructions": "1. Find Player.smali 2. Locate getCoins()I 3. Replace iget with const",\n' +
'  "fridaScript": "Java.perform(function(){ ... });",\n' +
'  "modifiedContent": "COMPLETE FILE WITH CHANGE APPLIED"\n' +
'}\n\n' +
'category: resources, gameplay, combat, speed, premium, limits, ads, popups, unlock, security, permissions, trackers, frida, debug, iap, memory, native, savedata, network, automation, deobfuscation, assets, spoofing, messaging, branding, configuration, cleanup, features\n' +
'modSide: client, server, both\n' +
'difficulty: easy, medium, hard\n\n' +
'Generate as many REAL mods as the file supports. Target 8-20 mods.\n' +
'START WITH [ AND END WITH ]. NOTHING ELSE.';

var SYSTEM_PROMPT_RETRY = 'Return ONLY a JSON array of 8-20 real APK modifications. No markdown fences.\n\n' +
'Each mod MUST have: label, description, category, modSide, difficulty, targetFile, lineRange, diff, instructions, modifiedContent.\n' +
'The diff MUST be GitHub-style unified diff with @@ hunk headers and +/- markers.\n' +
'Target file MUST be exact path within the APK/decompiled structure.\n\n' +
'Priority mods (use ALL that apply to the file):\n' +
'- Unlimited Coins/Gems/Gold/Tokens/Diamonds/Crystals/Energy/XP/Ammo (resources)\n' +
'- God Mode / Infinite Health/Lives/Shields/Stamina (gameplay)\n' +
'- Damage x1000 / One Hit Kill / Critical Always (combat)\n' +
'- Speed x2/x5/x10 / Animation Speed / Timer Freeze (speed)\n' +
'- Premium/VIP/Pro/AdFree/License bypass (premium)\n' +
'- Cooldown removal / Daily limit removal / Wait timer (limits)\n' +
'- Remove ALL ads (AdMob/Facebook/Unity/IronSource/AppLovin) (ads)\n' +
'- Remove rating/update/consent/share/tutorial popups (popups)\n' +
'- Unlock all levels/characters/weapons/skins/maps (unlock)\n' +
'- SSL pinning/Root/Emulator/Frida/Tamper/SafetyNet bypass (security)\n' +
'- Permission removal/Export activities/Debuggable/Screenshot (permissions)\n' +
'- Firebase/Crashlytics/Facebook/Google/AppsFlyer analytics removal (trackers)\n' +
'- Frida scripts for runtime hooking (frida)\n' +
'- Debug menu enable / Developer options (debug)\n' +
'- IAP bypass / Free purchases (iap)\n' +
'- Memory editing / Hex patching / NOP patching (memory)\n' +
'- IL2CPP hooking / Native lib injection (native)\n' +
'- SharedPreferences / SQLite / Save file editing (savedata)\n' +
'- MITM enable / API redirect / WebView SSL bypass (network)\n' +
'- Device spoofing / GPS mock / Location override (spoofing)\n' +
'- Toast messages / Custom dialogs (messaging)\n' +
'- Asset replacement / Color/Font/String override (assets)\n' +
'Use real smali instructions. Provide COMPLETE Frida scripts.\n' +
'START WITH [ AND END WITH ]. NOTHING ELSE.';

// ── Content truncation ──
function truncateContent(content) {
  if (content.length <= MAX_FILE_CHARS) return content;
  var headLen = Math.floor(MAX_FILE_CHARS * 0.6);
  var tailLen = MAX_FILE_CHARS - headLen;
  return content.slice(0, headLen) +
    '\n\n/* ... truncated — original is ' + content.length + ' chars ... */\n\n' +
    content.slice(-tailLen);
}

// ── Main entry ──
export function analyzeAndSuggestMods(fileContent, fileType, modelId, onProgress) {
  var fileTypeLabel = {
    manifest: 'AndroidManifest.xml (binary or text)',
    strings: 'res/values/strings.xml (Android string resources)',
    colors: 'res/values/colors.xml (Android color resources)',
    smali: 'Smali bytecode file (.smali — Dalvik assembly)',
    config: 'JSON/properties/config file',
    html: 'HTML/CSS/JS embedded web asset',
    custom: 'Unknown Android packaged file',
  }[fileType] || 'Android file';

  var truncated = truncateContent(fileContent);
  var wasTruncated = truncated.length < fileContent.length;

  var userMsg = 'FILE TYPE: ' + fileTypeLabel +
    (wasTruncated ? ' (truncated from ' + fileContent.length + ' chars)' : '') +
    '\n\nFILE CONTENT:\n' + truncated;

  return doAttempt(1, null);

  function doAttempt(attempt, lastError) {
    if (attempt > MAX_RETRIES) {
      throw lastError || new Error('Analysis failed after all attempts');
    }

    var isRetry = attempt > 1;
    var timeout = BASE_TIMEOUT_MS + (attempt - 1) * 60000;

    if (onProgress) {
      onProgress({
        attempt: attempt,
        maxAttempts: MAX_RETRIES,
        phase: isRetry ? 'retrying' : 'calling',
        message: isRetry
          ? 'Retry ' + attempt + '/' + MAX_RETRIES + ' — stricter prompt...'
          : 'Attempt ' + attempt + '/' + MAX_RETRIES + ' — analyzing file...',
      });
    }

    var systemPrompt = isRetry ? SYSTEM_PROMPT_RETRY : SYSTEM_PROMPT_PRIMARY;

    return providerCallModel({
      modelId: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      timeoutMs: timeout,
    }).then(function(result) {
      var raw = providerExtractText(result);
      if (!raw || raw.trim().length === 0) throw new Error('AI returned empty response');

      var mods = parseModsRobust(raw, fileContent);
      if (mods.length > 0) return mods;

      throw new Error('AI returned data but no valid mods found');
    })['catch'](function(err) {
      lastError = err;
      var errMsg = (err.message || '').toLowerCase();
      var isTimeout = errMsg.indexOf('timeout') >= 0 || errMsg.indexOf('timed out') >= 0;

      if (onProgress) {
        onProgress({
          attempt: attempt,
          maxAttempts: MAX_RETRIES,
          phase: 'error',
          message: isTimeout
            ? 'Attempt ' + attempt + ' timed out — ' + (attempt < MAX_RETRIES ? 'retrying...' : 'exhausted.')
            : 'Attempt ' + attempt + ' failed: ' + err.message + (attempt < MAX_RETRIES ? ' — retrying...' : ''),
        });
      }

      if (attempt < MAX_RETRIES) {
        return new Promise(function(r) { setTimeout(r, attempt === 1 ? 2000 : 5000); })
          .then(function() { return doAttempt(attempt + 1, err); });
      }
      return doAttempt(attempt + 1, err);
    });
  }
}

// ── Diff verification (anti-hallucination) ──
// Parses a GitHub-style unified diff and checks whether the lines it claims to
// remove/keep (the "old" side) actually exist in the real original file content.
// This is the only defense against an LLM inventing a plausible-looking but
// non-existent smali/XML edit — the prompt FORBIDS impossible mods, but nothing
// previously enforced it.

function normalizeVerifyLine(line) {
  return String(line == null ? '' : line).replace(/\s+/g, ' ').trim();
}

// Parses unified diff text into hunks of { oldStart, oldLines: [{text, removed}], addedLines: [] }.
// Tolerates missing/garbled "@@" headers (some models omit or fake them) by
// falling back to an implicit hunk starting at line 1.
function parseUnifiedDiffHunks(diffText) {
  var lines = String(diffText || '').split('\n');
  var hunks = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var headerMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (headerMatch) {
      current = { oldStart: parseInt(headerMatch[1], 10), oldLines: [], addedLines: [], implicit: false };
      hunks.push(current);
      continue;
    }

    // Skip standard unified-diff metadata lines (git-style headers) so they
    // aren't mistaken for implicit-hunk content — they start with -/+ but are
    // not real removed/added file lines.
    if (line.indexOf('--- ') === 0 || line.indexOf('+++ ') === 0 ||
        line.indexOf('diff --git ') === 0 || line.indexOf('index ') === 0) {
      continue;
    }

    var prefix = line.charAt(0);
    if (!current) {
      if (prefix === '+' || prefix === '-' || prefix === ' ') {
        current = { oldStart: 1, oldLines: [], addedLines: [], implicit: true };
        hunks.push(current);
      } else {
        continue;
      }
    }

    if (prefix === '-') {
      current.oldLines.push({ text: line.slice(1), removed: true });
    } else if (prefix === ' ') {
      current.oldLines.push({ text: line.slice(1), removed: false });
    } else if (prefix === '+') {
      current.addedLines.push(line.slice(1));
    } else if (line.indexOf('@@') === -1 && line.trim().length > 0 && current.implicit) {
      // Stray unprefixed line inside a header-less hunk — treat as context.
      current.oldLines.push({ text: line, removed: false });
    }
  }
  return hunks;
}

// Finds the best-effort alignment of a hunk's "old side" lines within the real
// file, allowing a small amount of line drift to tolerate minor reformatting.
// Returns which specific old-line indices matched so the caller can score
// removed ("-") lines separately from context (" ") lines.
function findBestDiffAlignment(oldLinesNormalized, originalLinesNormalized, hint) {
  var total = oldLinesNormalized.length;
  if (total === 0) return { matched: 0, total: 0, flags: [] };

  var n = originalLinesNormalized.length;
  var candidates = [];

  if (typeof hint === 'number' && hint >= 0) {
    var lo = Math.max(0, hint - 25);
    var hi = Math.min(n, hint + 25);
    for (var k = lo; k < hi; k++) candidates.push(k);
  }

  var firstMeaningful = null;
  for (var fi = 0; fi < oldLinesNormalized.length; fi++) {
    if (oldLinesNormalized[fi].length > 0) { firstMeaningful = oldLinesNormalized[fi]; break; }
  }
  if (firstMeaningful && n <= 20000) {
    for (var oi = 0; oi < n; oi++) {
      if (originalLinesNormalized[oi] === firstMeaningful) candidates.push(oi);
    }
  }
  if (candidates.length === 0) {
    var cap = Math.min(n, 20000);
    for (var allI = 0; allI < cap; allI++) candidates.push(allI);
  }

  var seen = {};
  var uniq = [];
  for (var ci = 0; ci < candidates.length; ci++) {
    if (!seen[candidates[ci]]) { seen[candidates[ci]] = true; uniq.push(candidates[ci]); }
  }

  var bestMatched = -1;
  var bestFlags = null;
  for (var u = 0; u < uniq.length; u++) {
    var pos = uniq[u];
    var matched = 0;
    var flags = new Array(oldLinesNormalized.length);
    for (var li = 0; li < oldLinesNormalized.length; li++) {
      var want = oldLinesNormalized[li];
      if (want.length === 0) { matched++; flags[li] = true; continue; }
      var found = false;
      for (var drift = 0; drift <= 3 && (pos + drift) < n; drift++) {
        if (originalLinesNormalized[pos + drift] === want) { pos += drift + 1; found = true; break; }
      }
      flags[li] = found;
      if (found) matched++;
      else pos++;
    }
    if (matched > bestMatched) { bestMatched = matched; bestFlags = flags; }
    if (bestMatched === total) break;
  }

  return { matched: bestMatched < 0 ? 0 : bestMatched, total: total, flags: bestFlags || [] };
}

// Verifies a mod's unified diff against the real original file content and
// returns a confidence score + verified flag + human-readable notes.
// originalContent must be the FULL (untruncated) source the mod targets.
export function verifyModDiff(diff, originalContent, options) {
  options = options || {};
  var lineRange = options.lineRange;

  if (!diff || typeof diff !== 'string' || diff.trim().length === 0) {
    return { verified: false, confidence: 35, matchRatio: 0, notes: ['No diff provided — cannot verify this mod against the source file.'] };
  }
  if (typeof originalContent !== 'string' || originalContent.length === 0) {
    return { verified: null, confidence: 50, matchRatio: null, notes: ['Original file content unavailable — verification skipped.'] };
  }

  var hunks = parseUnifiedDiffHunks(diff);
  if (hunks.length === 0) {
    return { verified: false, confidence: 30, matchRatio: 0, notes: ['Diff has no recognizable +/-/@@ lines — likely malformed or fabricated.'] };
  }

  var originalLines = originalContent.split('\n');
  var originalNorm = new Array(originalLines.length);
  for (var oi = 0; oi < originalLines.length; oi++) originalNorm[oi] = normalizeVerifyLine(originalLines[oi]);

  var totalOld = 0;
  var totalMatched = 0;
  var removedTotal = 0;
  var removedMatched = 0;
  for (var hi = 0; hi < hunks.length; hi++) {
    var hunk = hunks[hi];
    var oldNorm = new Array(hunk.oldLines.length);
    for (var li = 0; li < hunk.oldLines.length; li++) oldNorm[li] = normalizeVerifyLine(hunk.oldLines[li].text);
    var hint = hunk.implicit ? null : (hunk.oldStart - 1);
    var result = findBestDiffAlignment(oldNorm, originalNorm, hint);
    totalOld += result.total;
    totalMatched += result.matched;

    // Score removed ("-") lines separately — these are the highest-stakes
    // claims ("this exact code exists to be deleted"). Context lines matching
    // alone is not sufficient proof; a diff can have accurate surrounding
    // context but a hallucinated deletion.
    for (var fi2 = 0; fi2 < hunk.oldLines.length; fi2++) {
      if (hunk.oldLines[fi2].removed) {
        removedTotal++;
        if (result.flags[fi2]) removedMatched++;
      }
    }
  }

  var matchRatio = totalOld > 0 ? (totalMatched / totalOld) : 0;
  // If the diff has no removed lines (pure addition), there's nothing extra to
  // penalize — fall back to the overall context match ratio.
  var removedMatchRatio = removedTotal > 0 ? (removedMatched / removedTotal) : matchRatio;
  var combinedRatio = removedTotal > 0 ? (matchRatio * 0.5 + removedMatchRatio * 0.5) : matchRatio;
  var confidence = Math.round(30 + combinedRatio * 60);
  var notes = [];

  if (removedTotal > 0 && removedMatchRatio < 0.6) {
    notes.push((removedTotal - removedMatched) + '/' + removedTotal + ' removed ("-") lines were not found in the original file — likely hallucinated deletions.');
  }

  if (lineRange) {
    var rangeMatch = String(lineRange).match(/(\d+)/);
    var firstHunkStart = hunks[0].implicit ? null : hunks[0].oldStart;
    if (rangeMatch && firstHunkStart) {
      var claimedLine = parseInt(rangeMatch[1], 10);
      if (Math.abs(claimedLine - firstHunkStart) <= 5) {
        confidence += 5;
      } else {
        confidence -= 5;
        notes.push('Claimed lineRange (' + lineRange + ') does not match the diff hunk header start (line ' + firstHunkStart + ').');
      }
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));
  var verified = matchRatio >= 0.6 && removedMatchRatio >= 0.6 && confidence >= 65;

  if (combinedRatio >= 0.9) notes.unshift('Diff content strongly matches the original file (' + Math.round(combinedRatio * 100) + '%).');
  else if (combinedRatio >= 0.6) notes.unshift('Diff content mostly matches the original file (' + Math.round(combinedRatio * 100) + '%).');
  else if (combinedRatio > 0) notes.unshift('Diff content only partially matches the original file (' + Math.round(combinedRatio * 100) + '%) — likely contains hallucinated or misplaced lines.');
  else notes.unshift('Diff content does not match the original file at all — likely fully hallucinated.');

  return { verified: verified, confidence: confidence, matchRatio: Math.round(combinedRatio * 100) / 100, notes: notes };
}

// ── Robust JSON parsing ──
function parseModsRobust(raw, originalContent) {
  if (!raw || raw.trim().length === 0) return [];

  var strategies = [
    function(s) { return JSON.parse(s); },
    function(s) {
      var m = s.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      return JSON.parse(m ? m[1].trim() : s);
    },
    function(s) {
      var i = s.indexOf('[');
      var j = s.lastIndexOf(']');
      if (i === -1 || j === -1 || j <= i) throw new Error('No array');
      return JSON.parse(s.slice(i, j + 1));
    },
    function(s) {
      var i = s.indexOf('[');
      var j = s.lastIndexOf(']');
      var v = (i !== -1 && j > i) ? s.slice(i, j + 1) : s;
      v = v.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(v);
    },
    function(s) {
      var i = s.indexOf('[');
      var j = s.lastIndexOf(']');
      var v = (i !== -1 && j > i) ? s.slice(i, j + 1) : s;
      v = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      v = v.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(v);
    },
    function(s) {
      var i = s.indexOf('[');
      if (i === -1) throw new Error('No array start');
      var v = s.slice(i);
      var depth = 0, inStr = false, esc = false, lastEnd = -1;
      for (var k = 0; k < v.length; k++) {
        var c = v[k];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{' || c === '[') depth++;
        if (c === '}' || c === ']') { depth--; if (depth === 0) lastEnd = k; }
      }
      if (lastEnd > 0) v = v.slice(0, lastEnd + 1);
      v = v.replace(/,\s*([}\]])/g, '$1');
      if (depth > 0) { v = v.replace(/,\s*$/, ''); while (depth > 0) { v += depth === 1 ? ']' : '}'; depth--; } }
      return JSON.parse(v);
    },
    function(s) {
      var objects = [];
      var re = /\{[\s\S]*?\}/g;
      var match;
      while ((match = re.exec(s)) !== null) {
        try {
          var obj = JSON.parse(match[0]);
          if (obj && obj.label && obj.modifiedContent) objects.push(obj);
        } catch (_) {}
      }
      if (objects.length === 0) throw new Error('No valid objects');
      return objects;
    },
  ];

  for (var i = 0; i < strategies.length; i++) {
    try {
      var parsed = strategies[i](raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        var mods = validateMods(parsed, originalContent);
        if (mods.length > 0) return mods;
      }
    } catch (_) {}
  }
  return [];
}

// ── Validate & enrich mod entries ──
var VALID_CATS = [
  'resources', 'gameplay', 'combat', 'speed', 'premium', 'limits',
  'ads', 'popups', 'unlock', 'security', 'permissions', 'trackers',
  'frida', 'debug', 'iap', 'memory', 'native', 'savedata', 'network',
  'automation', 'deobfuscation', 'assets', 'spoofing', 'messaging',
  'branding', 'configuration', 'cleanup', 'features',
];
var VALID_SIDES = ['client', 'server', 'both'];
var VALID_DIFF = ['easy', 'medium', 'hard'];

function validateMods(parsed, originalContent) {
  var mods = [];
  for (var i = 0; i < parsed.length; i++) {
    var m = parsed[i];
    if (!m || typeof m !== 'object') continue;
    if (!m.label || typeof m.label !== 'string') continue;
    if (!m.modifiedContent || typeof m.modifiedContent !== 'string') continue;
    if (m.modifiedContent.trim().length < 10) continue;

    var category = VALID_CATS.indexOf(m.category) >= 0 ? m.category : 'features';
    var modSide = VALID_SIDES.indexOf(m.modSide) >= 0 ? m.modSide : 'client';
    var difficulty = VALID_DIFF.indexOf(m.difficulty) >= 0 ? m.difficulty : 'medium';
    var diffStr = String(m.diff || '');
    var lineRangeStr = String(m.lineRange || '');

    var verification = verifyModDiff(diffStr, originalContent, { lineRange: lineRangeStr });

    mods.push({
      id: 'ai-mod-' + Date.now() + '-' + i,
      label: String(m.label).slice(0, 100),
      description: String(m.description || '').slice(0, 300),
      category: category,
      modSide: modSide,
      difficulty: difficulty,
      targetFile: String(m.targetFile || ''),
      lineRange: lineRangeStr,
      diff: diffStr,
      instructions: String(m.instructions || ''),
      fridaScript: String(m.fridaScript || ''),
      modifiedContent: m.modifiedContent,
      isAiMod: true,
      confidence: verification.confidence,
      verified: verification.verified,
      verificationNotes: verification.notes,
    });
  }
  return mods.filter(function(m) { return m.modifiedContent !== originalContent; });
}

// ── Category definitions (28 categories covering ALL real modification types) ──
export var AI_CATEGORIES = {
  resources: { name: 'Currency & Resources', icon: '&#128176;', color: 'emerald' },
  gameplay: { name: 'Gameplay Values', icon: '&#9876;&#65039;', color: 'rose' },
  combat: { name: 'Combat & Damage', icon: '&#128165;', color: 'red' },
  speed: { name: 'Speed & Time', icon: '&#9889;', color: 'yellow' },
  premium: { name: 'Premium & VIP Flags', icon: '&#127942;', color: 'amber' },
  limits: { name: 'Cooldowns & Limits', icon: '&#9201;', color: 'cyan' },
  ads: { name: 'Ads & Monetization', icon: '&#128680;', color: 'rose' },
  popups: { name: 'Popups & Dialogs', icon: '&#128172;', color: 'orange' },
  unlock: { name: 'Unlock Content', icon: '&#128275;', color: 'emerald' },
  security: { name: 'Security & Detection Bypass', icon: '&#128737;', color: 'red' },
  permissions: { name: 'Permissions', icon: '&#128274;', color: 'amber' },
  trackers: { name: 'Trackers & Analytics', icon: '&#128065;', color: 'orange' },
  frida: { name: 'Frida & Runtime Hooks', icon: '&#129504;', color: 'violet' },
  debug: { name: 'Debug & Dev Menu', icon: '&#128027;', color: 'green' },
  iap: { name: 'In-App Purchases', icon: '&#128722;', color: 'pink' },
  memory: { name: 'Memory & Runtime Editing', icon: '&#129504;', color: 'violet' },
  native: { name: 'Native & IL2CPP Hooking', icon: '&#128296;', color: 'red' },
  savedata: { name: 'Save Data & Database', icon: '&#128451;', color: 'amber' },
  network: { name: 'Network & Traffic', icon: '&#127760;', color: 'cyan' },
  automation: { name: 'Automation & Macros', icon: '&#129302;', color: 'blue' },
  deobfuscation: { name: 'Obfuscation & Unpacking', icon: '&#128270;', color: 'orange' },
  assets: { name: 'Assets & Resources', icon: '&#127912;', color: 'pink' },
  spoofing: { name: 'Device & Identity Spoofing', icon: '&#128373;', color: 'violet' },
  messaging: { name: 'Messaging & Toasts', icon: '&#128172;', color: 'emerald' },
  branding: { name: 'Branding & Text', icon: '&#128221;', color: 'pink' },
  configuration: { name: 'Configuration & Settings', icon: '&#9881;', color: 'cyan' },
  cleanup: { name: 'Cleanup & Optimization', icon: '&#128465;', color: 'emerald' },
  features: { name: 'Features & UI', icon: '&#128736;', color: 'blue' },
};

// ── ModSide labels ──
export var MOD_SIDES = {
  client: { label: 'Client-Side', color: 'cyan', desc: 'Runs entirely on device' },
  server: { label: 'Server-Side', color: 'amber', desc: 'Requires server modification' },
  both: { label: 'Client + Server', color: 'violet', desc: 'Needs both sides changed' },
};

// ── Difficulty labels ──
export var MOD_DIFFICULTY = {
  easy: { label: 'Easy', color: 'emerald', icon: '&#128994;' },
  medium: { label: 'Medium', color: 'amber', icon: '&#128992;' },
  hard: { label: 'Hard', color: 'red', icon: '&#128308;' },
};

// Strict modSide classification rules injected into analysis prompts
export var MOD_SIDE_CLASSIFICATION_RULES = 
'=== CRITICAL modSide CLASSIFICATION RULES (STRICT — YOU MUST FOLLOW) ===\\n' +
'Inspect the ACTUAL FILE CONTENT and classify accurately. NEVER default everything to client.\\n' +
'- "client": purely local on-device change (smali method body, local XML/JSON value, SharedPreferences, local cache, client-only validation, Frida hook that only runs on device).\\n' +
'- "server": requires modifying or bypassing SERVER logic. Look for network code in the file (HttpURLConnection, OkHttp, Retrofit, Volley, WebSocket, gRPC, protobuf, API calls, "verifyPurchase", "checkLicense", "sendPurchase", "syncProgress", "leaderboard", "cloudSave", "antiCheat", receipt validation, license server, backend requests). When present, create server-side mods such as:\\n' +
'    "Spoof server API response for unlimited resources", "Bypass server-side purchase validation by faking receipt", "Disable server cooldown by rewriting the API reply", "Intercept leaderboard sync to spoof scores", "MITM the purchase verification endpoint".\\n' +
'- "both": needs coordinated client + server changes (client edit + Frida to fake server response, or client hook + server config change).\\n' +
'\\n' +
'MANDATORY BALANCE RULE (ENFORCE THIS):\\n' +
'- If the file contains ANY network, Http, API, purchase, license, sync, or cloud code, or the APK declares INTERNET + billing/auth, you MUST output at least 40-60% of mods with modSide = "server" or "both".\\n' +
'- NEVER output only client-side mods when network logic is visible.\\n' +
'- When client code calls a server for validation, prefer "server" or "both" and describe the server bypass in the description.\\n' +
'- Explicitly scan for purchase, billing, leaderboard, cloud save, auth, and anti-cheat code and create the corresponding server bypass mods.\\n';
