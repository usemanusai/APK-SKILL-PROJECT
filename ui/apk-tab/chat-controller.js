// ui/apk-tab/chat-controller.js - APK Chat engine v3: 120+ mod types, context-aware AI
import { getState, setState } from '../../state.js';
import { t } from '../dom.js';

var MAX_RETRIES = 2;
var CHAT_TIMEOUT = 120000;
var MAX_HISTORY_IN_PROMPT = 24;
var STORAGE_KEY = 'apkChatHistory';

export function loadChatHistory() {
  return window.miniappsAI.storage.getItem(STORAGE_KEY).then(function(raw) {
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      if (Array.isArray(data.messages)) {
        setState({ apkChatMessages: data.messages });
      }
    } catch (e) {}
  }).catch(function(e) {
    console.warn('Could not load APK chat history', e);
  });
}

export function saveChatHistory() {
  var s = getState();
  var msgs = s.apkChatMessages || [];
  var payload = JSON.stringify({
    messages: msgs.slice(-200),
    updatedAt: Date.now(),
  });
  return window.miniappsAI.storage.setItem(STORAGE_KEY, payload).catch(function(e) {
    console.warn('Could not save APK chat history', e);
  });
}

export function clearChatHistory() {
  return window.miniappsAI.storage.removeItem(STORAGE_KEY).catch(function() {}).then(function() {
    setState({
      apkChatMessages: [],
      apkChatFollowUps: [],
      apkChatLoading: false,
    });
  });
}

function buildAPKContext() {
  var s = getState();
  var apk = s.apkFile;
  if (!apk) return '';

  var lines = ['APK CONTEXT:'];

  if (s.apkManifest) {
    var m = s.apkManifest;
    lines.push('Package: ' + m.package);
    if (m.versionName) lines.push('Version: ' + m.versionName);
    if (m.versionCode) lines.push('Version Code: ' + m.versionCode);
    if (m.minSdk) lines.push('Min SDK: ' + m.minSdk);
    if (m.targetSdk) lines.push('Target SDK: ' + m.targetSdk);
    if (m.permissions && m.permissions.length) {
      lines.push('Permissions (' + m.permissions.length + '):');
      m.permissions.slice(0, 15).forEach(function(p) { lines.push('  - ' + p); });
    }
    if (m.activities && m.activities.length) lines.push('Activities: ' + m.activities.length);
    if (m.services && m.services.length) lines.push('Services: ' + m.services.length);
    if (m.receivers && m.receivers.length) lines.push('Receivers: ' + m.receivers.length);
    if (m.providers && m.providers.length) lines.push('Providers: ' + m.providers.length);
  }

  lines.push('');
  lines.push('FILE BREAKDOWN:');
  var cats = apk.categories || {};
  Object.keys(cats).forEach(function(key) {
    var files = cats[key];
    if (files && files.length) lines.push('  ' + key + ': ' + files.length + ' files');
  });

  var editable = apk.editablePaths || [];
  lines.push('');
  lines.push('EDITABLE TEXT FILES (' + editable.length + '):');
  editable.slice(0, 30).forEach(function(p) { lines.push('  - ' + p); });

  if (apk.containerType && apk.containerType !== 'apk') {
    lines.push('');
    lines.push('Container Type: ' + apk.containerType.toUpperCase());
    var diags = apk.containerDiagnostics;
    if (diags && diags.warnings && diags.warnings.length) {
      lines.push('Container Warnings:');
      diags.warnings.forEach(function(w) { lines.push('  - ' + w); });
    }
  }

  return lines.join('\n');
}

function buildKeyFilesContext() {
  var s = getState();
  var keyFiles = s.apkKeyFiles;
  if (!keyFiles || typeof keyFiles !== 'object') return '';

  var lines = ['KEY FILE EXCERPTS:'];
  var paths = Object.keys(keyFiles).slice(0, 10);
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    var data = keyFiles[path];
    if (!data || !data.content) continue;
    var preview = data.content.slice(0, 1500);
    lines.push('\n=== ' + path + ' (' + (data.lines || '?') + ' lines) ===');
    if (data.methods && data.methods.length) lines.push('Methods: ' + data.methods.join(', '));
    lines.push(preview);
    if (data.content.length > 1500) lines.push('... (truncated)');
  }
  return lines.join('\n');
}

function buildModsContext() {
  var s = getState();
  var mods = s.apkMods || [];
  if (mods.length === 0) return '';

  var lines = ['AI-DETECTED MODIFICATIONS:'];
  for (var i = 0; i < mods.length; i++) {
    var mod = mods[i];
    var status = mod.blocked ? '(blocked)' : '(safe)';
    lines.push((i + 1) + '. [' + (mod.category || 'misc') + '] ' + mod.label + ' ' + status);
    if (mod.description) lines.push('   ' + mod.description);
    if (mod.fileChanges && mod.fileChanges.length) {
      for (var j = 0; j < mod.fileChanges.length; j++) {
        lines.push('   Target: ' + mod.fileChanges[j].path);
      }
    }
  }
  return lines.join('\n');
}

function buildSystemPrompt() {
  var apkContext = buildAPKContext();
  var keyFiles = buildKeyFilesContext();
  var modsContext = buildModsContext();

  var parts = [
    'You are an expert Android APK modification assistant integrated into an APK analysis tool.',
    '',
    'ROLE:',
    '- You have FULL CONTEXT of the uploaded APK: manifest, file structure, editable files, and AI-detected modifications.',
    '- You answer questions about the APK structure, possible modifications, safety of changes, and best practices.',
    '- You can suggest NEW modifications beyond what was auto-detected.',
    '- You help the user understand what each part of the APK does.',
    '- You explain risks, limitations, and real-world constraints honestly.',
    '',
    'CAPABILITIES:',
    '- You understand smali code, AndroidManifest.xml, resources.arsc, DEX files, native libs',
    '- You know which files are SAFE to modify (text configs, JSON, HTML, CSS, JS, properties)',
    '- You know which files are RISKY or IMPOSSIBLE to modify in-browser',
    '- You understand APK signing schemes (V1/V2/V3), zipalign, and the rebuild pipeline',
    '',
    'RESPONSE FORMAT:',
    '- Use markdown formatting for readability',
    '- Use code blocks with language hints for code',
    '- Be specific to THIS APK, not generic',
    '- Reference actual file paths from the APK when relevant',
    '- Always note safety level: safe / risky / impossible for browser pipeline',
    '',
    'MODIFICATION SUGGESTIONS:',
    'When suggesting modifications:',
    '1. Only target files that exist in the editable file list',
    '2. Provide ACTUAL code snippets with the specific changes',
    '3. Include a GitHub-style unified diff when possible',
    '4. Specify the exact file path and line range where changes go',
    '5. Explain the expected effect',
    '6. Rate difficulty: easy / medium / hard',
    '7. Note if external tools are needed (apktool, frida, etc.)',
    '8. Warn about potential app crashes or issues',
    '9. Tag each modification as client-side, server-side, or both',
    '',
    '=== 120+ REAL MODIFICATION TYPES (grouped into 24 categories) ===',
    '',
    'A. CURRENCY & RESOURCES:',
    '   Unlimited Coins/Gems/Gold/Tokens/Diamonds/Crystals/Energy/XP/Ammo/Mana/Fuel/Food/Tickets',
    '   set to INT_MAX (2147483647) or 999999999',
    '   smali: const v0, 0x7FFFFFFF / iget/iput field replacement',
    '   XML: set integer values to 2147483647. JSON: set to 999999999',
    '',
    'B. GOD MODE & INVINCIBILITY:',
    '   Infinite Health/HP/Lives/Shields/Stamina/Armor/Oxygen',
    '   No Fall Damage, No Drowning, No Starvation, Health Regen Override',
    '   smali: .method public takeDamage(I)V / return-void',
    '   Or: const/4 v0, 0x0 / iput v0, p0, Lclass;->health:I / return-void',
    '',
    'C. COMBAT & DAMAGE:',
    '   Damage x100 (0x64), Damage x1000 (0x3E8), One Hit Kill (0x7FFFFFFF)',
    '   Critical Hit Always (1.0f = 0x3F800000), Accuracy 100%, Range Override',
    '   Attack Speed Boost, Defense Max, Reflect Damage, AOE Increase',
    '   smali: mul-int/lit16 v0, v0, 0x3E8 (multiply by 1000)',
    '',
    'D. SPEED & TIME:',
    '   Speed x2 (2.0f = 0x40000000), x5 (5.0f = 0x40A00000), x10 (10.0f = 0x41200000)',
    '   Animation Speed, Game Speed (Time.timeScale), Cooldown Speed',
    '   Build Speed, Timer Freeze, Speed Hack via System.currentTimeMillis hook',
    '   Unity: Time;->set_timeScale(F)V, pass 2.0f',
    '',
    'E. PREMIUM & VIP FLAGS:',
    '   isPremium()Z, isVIP()Z, isPro()Z, isSubscribed()Z, isAdFree()Z, isProUnlocked()Z',
    '   Remove Paywall, Subscription Bypass, Trial Reset',
    '   License Verification Bypass, Google Play License (LVL) bypass',
    '   smali: const/4 v0, 0x1 / return v0 (return true)',
    '',
    'F. COOLDOWNS & LIMITS:',
    '   Ability Cooldown Removal, Energy/Stamina Regen, Daily Limit Removal',
    '   Rate Limit Bypass, Wait Timer Removal (Thread.sleep(0)), Action Limit Removal',
    '   Retry Limit Removal, Session Limit Bypass',
    '   smali: const/4 v0, 0x0 / iput v0, p0, Lclass;->cooldown:I',
    '',
    'G. ADS & MONETIZATION:',
    '   Remove AdMob/Facebook Ads/Unity Ads/IronSource/AppLovin/Mintegral',
    '   Remove Banner Ads (visibility GONE 0x8), Interstitial (show return-void)',
    '   Remove Video/Rewarded Ads, Reward Without Watching',
    '   Manifest: remove ad activity/service/receiver/meta-data entries',
    '',
    'H. POPUPS & DIALOGS:',
    '   Remove Rating/Update/Newsletter/Consent/GDPR/Cookie Banner',
    '   Remove What\'s New, Tutorial/Onboarding (isFirstLaunch false)',
    '   Remove Social Share, Push Notification, Survey prompts',
    '   smali: shouldShowReviewDialog()Z / const/4 v0, 0x0 / return v0',
    '',
    'I. CONTENT UNLOCKING:',
    '   Unlock All Levels/Characters/Weapons/Skins/Vehicles/Maps/Difficulties',
    '   Unlock Achievements, Season/Battle Pass, Hidden Features, Music/Chapters',
    '   smali: isLevelUnlocked(I)Z / const/4 v0, 0x1 / return v0',
    '',
    'J. SECURITY & DETECTION BYPASS:',
    '   SSL Pinning Bypass (checkServerTrusted return-void)',
    '   Root Detection Bypass (isDeviceRooted return false)',
    '   Emulator Detection Bypass (Build.FINGERPRINT/MODEL/HARDWARE return false)',
    '   Magisk/Frida/Debugger/Tamper/Integrity/Signature/SafetyNet/Anti-Mod Bypass',
    '   Xposed Detection Bypass, BusyBox Detection Bypass',
    '',
    'K. PERMISSIONS:',
    '   Remove Dangerous Permissions (CAMERA, READ_CONTACTS, ACCESS_FINE_LOCATION)',
    '   Export All Activities (exported=true), Enable Backup (allowBackup=true)',
    '   Enable Debuggable (debuggable=true), Screenshot Removal (remove FLAG_SECURE)',
    '   Screen Recording Enable, Remove Runtime Permission Checks',
    '',
    'L. TRACKERS & ANALYTICS:',
    '   Remove Firebase Analytics (logEvent no-op)',
    '   Remove Crashlytics, Facebook Analytics, Google Analytics',
    '   Remove AppsFlyer, Adjust, Amplitude, Mixpanel, OneSignal, Pushwoosh',
    '   Remove Location Tracking, Device Fingerprinting',
    '   Manifest: remove analytics service/receiver/meta-data',
    '',
    'M. FRIDA & RUNTIME HOOKS:',
    '   SSL Pinning Bypass via Frida (hook X509TrustManager)',
    '   Root Detection Bypass via Frida (hook Runtime.exec)',
    '   Method Return Value Override (hook any method, override return)',
    '   String Decryption Hook, SharedPreferences Hook',
    '   Network Request Interceptor (hook OkHttp/HttpURLConnection)',
    '   Crypto Key Extraction (hook Cipher/MessageDigest)',
    '   Pattern: Java.perform(function(){ var C = Java.use("com.target.Class");',
    '     C.method.implementation = function(){ return true; }; });',
    '',
    'N. DEBUG & DEV MENU:',
    '   Enable Debug Build (BuildConfig.DEBUG true)',
    '   Enable Dev Menu, Logging (VERBOSE), FPS Counter, Hidden Settings',
    '',
    'O. IN-APP PURCHASES:',
    '   Client-side purchase bypass (return RESULT_OK)',
    '   Free IAP emulation, Subscription emulation, Remove purchase verification',
    '   NOTE: Only works for client-side validated purchases',
    '',
    'P. MEMORY & RUNTIME EDITING:',
    '   Memory value search/replace, Memory freeze (lock address)',
    '   Speed hack via timer hook (System.currentTimeMillis)',
    '   Memory dump, Pointer chain resolution',
    '   Hex .so patching, NOP instruction patching, Jump patching',
    '   Frida: Memory.writeFloat(ptr("0xADDR"), 999999.0)',
    '',
    'Q. NATIVE & IL2CPP HOOKING:',
    '   Native library injection (System.loadLibrary in smali)',
    '   IL2CPP function hooking (hook libil2cpp.so by offset)',
    '   IL2CPP dump (global-metadata.dat analysis)',
    '   libil2cpp.so hex patching, JNI function hooking',
    '   Unity Mono method replacement (Assembly-CSharp.dll)',
    '   ARM/ARM64 instruction patching',
    '',
    'R. SAVE DATA & DATABASE:',
    '   SharedPreferences editing (XML files)',
    '   SQLite database editing (coins, progress, stats)',
    '   Save game file editing (JSON, XML, binary)',
    '   Level/Progress/Inventory/Achievement unlock via database',
    '',
    'S. NETWORK & TRAFFIC:',
    '   MITM proxy enable (apk-mitm: remove network_security_config)',
    '   API response tampering, Request replay',
    '   Certificate transparency bypass, Network security config override',
    '   WebView SSL bypass (onReceivedSslError → handler.proceed)',
    '   API endpoint redirect, WebSocket interception',
    '',
    'T. AUTOMATION & MACROS:',
    '   Auto-clicker injection, Macro recorder, Bot behavior, Auto-farm script',
    '   Auto-play/Auto-battle, Task automation',
    '',
    'U. OBFUSCATION & UNPACKING:',
    '   ProGuard deobfuscation (rename La/b/c; to Lcom/actual/Class;)',
    '   String decryption, DexGuard unpacking, Anti-tamper removal',
    '   Resource obfuscation bypass, Control flow deobfuscation',
    '',
    'V. ASSETS & RESOURCE EDITING:',
    '   Texture/Sound/Model/Font replacement in assets/ or res/',
    '   Color scheme override (colors.xml), Layout modification',
    '   String override (strings.xml), Animation speed, Theme override',
    '   Splash screen change',
    '',
    'W. DEVICE & IDENTITY SPOOFING:',
    '   Device model (Build.MODEL), GPS location, Android ID, IMEI',
    '   MAC address, User-Agent, DPI/Resolution, Language, Timezone',
    '   Frida: Java.use("android.os.Build").MODEL.value = "CustomDevice"',
    '',
    'X. MESSAGING & UI:',
    '   Add Toast messages, Custom dialogs, Floating widgets, Notifications',
    '   Message boxes on launch for mod confirmation',
    '',
    'LIMITATIONS:',
    '- This browser pipeline can only rewrite existing packaged TEXT files',
    '- Compiled Android resources (binary XML, 9-patch, ARSC) CANNOT be rewritten here',
    '- DEX bytecode cannot be modified directly',
    '- Native .so libraries cannot be modified (but can be replaced entirely)',
    '- Final APK must be rebuilt with real Android toolchain',
    '- Updating a vendor-signed app requires the original signing key',
  ];

  if (apkContext) parts.push('', apkContext);
  if (keyFiles) parts.push('', keyFiles);
  if (modsContext) parts.push('', modsContext);

  return parts.join('\n');
}

function generateFollowUps(lastUserMsg, lastAssistantMsg) {
  var s = getState();
  var apk = s.apkFile;
  if (!apk) return [];

  var cats = apk.categories || {};
  var editable = apk.editablePaths || [];
  var mods = s.apkMods || [];
  var followUps = [];

  if (editable.length > 0 && !hasAskedAbout('editable files')) {
    followUps.push('What are all ' + editable.length + ' editable files?');
  }
  if (cats.smali && cats.smali.length > 0 && !hasAskedAbout('smali')) {
    followUps.push('How can I modify smali code in this APK?');
  }
  if (cats.resources && cats.resources.length > 0 && !hasAskedAbout('resources')) {
    followUps.push('What resources can I safely change?');
  }
  if (cats.assets && cats.assets.length > 0 && !hasAskedAbout('assets')) {
    followUps.push('What are the assets/ files doing?');
  }
  if (mods.length > 0) {
    var blockedCount = 0;
    var safeCount = 0;
    for (var i = 0; i < mods.length; i++) {
      if (mods[i].blocked) blockedCount++;
      else safeCount++;
    }
    if (blockedCount > 0 && !hasAskedAbout('blocked')) {
      followUps.push('Why are ' + blockedCount + ' modifications blocked?');
    }
    if (safeCount > 0 && !hasAskedAbout('safe mods')) {
      followUps.push('Explain all ' + safeCount + ' safe modifications');
    }
  }
  if (cats.dex && cats.dex.length > 0 && !hasAskedAbout('DEX')) {
    followUps.push('Can I modify DEX bytecode here?');
  }
  if (cats.libs && cats.libs.length > 0 && !hasAskedAbout('native')) {
    followUps.push('What are the native .so libraries?');
  }

  var recentCtx = (lastAssistantMsg || '').toLowerCase();
  if (recentCtx.indexOf('risk') >= 0 || recentCtx.indexOf('danger') >= 0 || recentCtx.indexOf('careful') >= 0) {
    followUps.push('What is the safest modification I can make?');
  }
  if (recentCtx.indexOf('sign') >= 0 || recentCtx.indexOf('key') >= 0) {
    followUps.push('How does APK signing work for this rebuild?');
  }
  if (recentCtx.indexOf('smali') >= 0 || recentCtx.indexOf('method') >= 0) {
    followUps.push('Show me specific smali changes for this APK');
  }

  var unexplained = [];
  for (var k = 0; k < mods.length; k++) {
    if (!hasAskedAbout(mods[k].label)) unexplained.push(mods[k]);
    if (unexplained.length >= 2) break;
  }
  for (var u = 0; u < unexplained.length; u++) {
    followUps.push('Explain: "' + unexplained[u].label + '"');
  }

  if (!hasAskedAbout('all possibilities')) {
    followUps.push('List ALL possible modifications for this APK');
  }
  if (mods.length > 0 && !hasAskedAbout('export')) {
    followUps.push('Which mods should I export for the rebuild?');
  }

  var seen = {};
  var unique = [];
  for (var f = 0; f < followUps.length; f++) {
    var key = followUps[f].toLowerCase().trim();
    if (!seen[key]) {
      seen[key] = true;
      unique.push(followUps[f]);
    }
  }
  return unique.slice(0, 6);

  function hasAskedAbout(topic) {
    var q = topic.toLowerCase();
    var messages = s.apkChatMessages || [];
    for (var m = 0; m < messages.length; m++) {
      if (messages[m].role === 'user' && messages[m].content && messages[m].content.toLowerCase().indexOf(q) >= 0) {
        return true;
      }
    }
    return false;
  }
}

export function sendApkChatMessage(text, renderFn) {
  text = text.trim();
  if (!text || getState().apkChatLoading) return Promise.resolve();

  var prevMessages = getState().apkChatMessages || [];
  var messages = prevMessages.concat([{ role: 'user', content: text, ts: Date.now() }]);
  setState({
    apkChatMessages: messages,
    apkChatLoading: true,
    apkChatFollowUps: [],
  });
  renderFn();

  var withLoading = messages.concat([{ role: 'assistant', content: '', isLoading: true, ts: Date.now() }]);
  setState({ apkChatMessages: withLoading });
  renderFn();

  var modelId = getState().apkChatModelId;
  var systemPrompt = buildSystemPrompt();

  var history = messages.slice(-MAX_HISTORY_IN_PROMPT);
  var apiMessages = [{ role: 'system', content: systemPrompt }];
  for (var h = 0; h < history.length; h++) {
    apiMessages.push({ role: history[h].role, content: history[h].content });
  }

  return doAttempt(1, null);

  function doAttempt(attempt, lastErr) {
    if (attempt > MAX_RETRIES) {
      return finishWithError(messages, lastErr, renderFn);
    }

    var timeout = CHAT_TIMEOUT + (attempt - 1) * 60000;

    return window.miniappsAI.callModel({
      modelId: modelId,
      messages: apiMessages,
      timeoutMs: timeout,
    }).then(function(result) {
      var reply = window.miniappsAI.extractText(result) || '';
      if (reply.trim().length > 0) {
        return finishWithReply(messages, text, reply, renderFn);
      }
      return doAttempt(attempt + 1, new Error('Empty response'));
    }).catch(function(err) {
      console.warn('APK chat attempt ' + attempt + '/' + MAX_RETRIES + ' failed:', err.message);
      if (attempt < MAX_RETRIES) {
        var retryMsgs = [];
        for (var r = 0; r < messages.length; r++) {
          if (!messages[r].isLoading) retryMsgs.push(messages[r]);
        }
        retryMsgs.push({ role: 'assistant', content: '', isLoading: true, ts: Date.now() });
        setState({ apkChatMessages: retryMsgs });
        renderFn();
        return new Promise(function(resolve) { setTimeout(resolve, 2000); }).then(function() {
          return doAttempt(attempt + 1, err);
        });
      }
      return finishWithError(messages, err, renderFn);
    });
  }
}

function finishWithReply(messages, userText, reply, renderFn) {
  var finalMsgs = [];
  for (var i = 0; i < messages.length; i++) {
    if (!messages[i].isLoading) finalMsgs.push(messages[i]);
  }
  finalMsgs.push({ role: 'assistant', content: reply, ts: Date.now() });

  var followUps = generateFollowUps(userText, reply);

  setState({
    apkChatMessages: finalMsgs,
    apkChatLoading: false,
    apkChatFollowUps: followUps,
  });

  saveChatHistory();
  renderFn();
}

function finishWithError(messages, lastErr, renderFn) {
  var errMsg = '';
  if (lastErr && lastErr.message) errMsg = lastErr.message.toLowerCase();

  var reply;
  if (errMsg.indexOf('timeout') >= 0 || errMsg.indexOf('timed out') >= 0) {
    reply = 'Request timed out. Try a faster model or ask a more focused question.';
  } else if (errMsg.indexOf('credit') >= 0 || errMsg.indexOf('quota') >= 0) {
    reply = 'Not enough credits or rate limited. Try a cheaper model.';
  } else {
    reply = 'Sorry, something went wrong: ' + (lastErr ? lastErr.message : 'Unknown error') + '. Try a different model or rephrase your question.';
  }

  var finalMsgs = [];
  for (var i = 0; i < messages.length; i++) {
    if (!messages[i].isLoading) finalMsgs.push(messages[i]);
  }
  finalMsgs.push({ role: 'assistant', content: reply, ts: Date.now() });

  setState({
    apkChatMessages: finalMsgs,
    apkChatLoading: false,
    apkChatFollowUps: [],
  });

  saveChatHistory();
  renderFn();
}

export function retryApkChatMessage(messageIndex, renderFn) {
  var messages = getState().apkChatMessages || [];
  if (messageIndex < 0 || messageIndex >= messages.length) return;

  var userMsg = null;
  for (var i = messageIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userMsg = messages[i].content;
      break;
    }
  }
  if (!userMsg) return;

  var trimmed = messages.slice(0, messageIndex);
  setState({ apkChatMessages: trimmed });
  sendApkChatMessage(userMsg, renderFn);
}
