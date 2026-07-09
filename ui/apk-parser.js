// ui/apk-parser.js - APK extraction, AXML parsing, file analysis, validation (ES5)
import { signAPK, verifySignedApkBytes } from './apk-signer.js';

var AXML_MAGIC = 0x00080003;
var STRING_POOL_TYPE = 0x001C0001;
var MAX_TEXT_SCAN_BYTES = 32768;
var MAX_EDITABLE_FILE_SIZE = 1024 * 1024;

// AXML node/chunk types used by parseAXMLTree, per AOSP ResourceTypes.h.
// These are the low-16-bit "type" field of each chunk's ResChunk_header,
// as read via DataView#getUint16 - NOT the commonly-quoted combined
// type+headerSize 32-bit magic (e.g. 0x00100102 for START_ELEMENT is
// headerSize=0x0010 packed with type=0x0102; we only compare the type half).
var RES_XML_RESOURCE_MAP_TYPE = 0x0180;
var RES_XML_START_NAMESPACE_TYPE = 0x0100;
var RES_XML_END_NAMESPACE_TYPE = 0x0101;
var RES_XML_START_ELEMENT_TYPE = 0x0102;
var RES_XML_END_ELEMENT_TYPE = 0x0103;
var RES_XML_CDATA_TYPE = 0x0104;
var TYPE_INT_BOOLEAN = 0x12;
var TYPE_INT_DEC = 0x10;
var TYPE_INT_HEX = 0x11;
var NO_STRING_REF = 0xFFFFFFFF;

var _safeExts = ['.json', '.txt', '.cfg', '.conf', '.ini', '.properties', '.prop', '.xml',
  '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.csv', '.tsv', '.md',
  '.yaml', '.yml', '.toml', '.sql', '.graphql', '.gql', '.smali', '.kt', '.java'];
var SAFE_TEXT_EXTENSIONS = {};
for (var _se = 0; _se < _safeExts.length; _se++) SAFE_TEXT_EXTENSIONS[_safeExts[_se]] = true;

var _storeExts = ['.so', '.dex', '.arsc',
  '.ogg', '.mp3', '.wav', '.m4a',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.mp4', '.webm', '.mkv',
  '.zip', '.gz', '.bz2', '.xz'];
var STORE_EXTENSIONS = {};
for (var _ste = 0; _ste < _storeExts.length; _ste++) STORE_EXTENSIONS[_storeExts[_ste]] = true;

export function parseAXMLStrings(buffer) {
  try {
    if (buffer.byteLength < 36) return null;
    var view = new DataView(buffer);
    var uint8 = new Uint8Array(buffer);

    if (view.getUint32(0, true) !== AXML_MAGIC) {
      var text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      if (text.indexOf('<manifest') >= 0 || text.indexOf('<?xml') >= 0) return { strings: [], rawText: text };
      return null;
    }

    if (view.getUint32(8, true) !== STRING_POOL_TYPE) return null;

    var stringCount = view.getUint32(16, true);
    var flags = view.getUint32(24, true);
    var stringsStart = view.getUint32(28, true);
    var isUTF8 = (flags & 0x100) !== 0;
    if (stringCount > 50000) return null;

    var offsetsStart = 36;
    var strings = [];

    for (var i = 0; i < stringCount; i++) {
      if (offsetsStart + i * 4 + 4 > buffer.byteLength) break;
      var stringOffset = view.getUint32(offsetsStart + i * 4, true);
      var absOffset = 8 + stringsStart + stringOffset;
      if (absOffset >= buffer.byteLength - 2) {
        strings.push('');
        continue;
      }

      try {
        if (isUTF8) {
          var pos = absOffset;
          var charLen = uint8[pos++];
          if (charLen & 0x80) charLen = ((charLen & 0x7F) << 8) | uint8[pos++];
          var byteLen = uint8[pos++];
          if (byteLen & 0x80) byteLen = ((byteLen & 0x7F) << 8) | uint8[pos++];
          if (pos + byteLen > buffer.byteLength) {
            strings.push('');
            continue;
          }
          strings.push(new TextDecoder('utf-8').decode(uint8.slice(pos, pos + byteLen)));
        } else {
          var pos2 = absOffset;
          var charLen2 = view.getUint16(pos2, true);
          pos2 += 2;
          if (pos2 + charLen2 * 2 > buffer.byteLength) {
            strings.push('');
            continue;
          }
          strings.push(new TextDecoder('utf-16le').decode(uint8.slice(pos2, pos2 + charLen2 * 2)));
        }
      } catch (e) {
        strings.push('');
      }
    }

    return { strings: strings };
  } catch (error) {
    console.warn('AXML parse error:', error);
    return null;
  }
}

function resolveAXMLString(strings, ref) {
  if (ref === undefined || ref === null || ref === NO_STRING_REF) return null;
  var s = strings[ref];
  return s === undefined ? null : s;
}

function resolveAXMLAttrValue(strings, rawValueRef, dataType, data) {
  var s = resolveAXMLString(strings, rawValueRef);
  if (s !== null) return s;
  if (dataType === TYPE_INT_BOOLEAN) return data !== 0;
  if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) return String(data);
  return null;
}

// Lightweight streaming walk of the AXML node-chunk stream (after the string
// pool, which parseAXMLStrings already extracts). Rather than building a full
// generic DOM, this tracks only the handful of elements/attributes needed to
// answer the manifest risk questions: <application>, <uses-sdk>, and the
// exported/intent-filter shape of <activity>/<service>/<receiver>/<provider>.
// Returns null (never throws) if the buffer is malformed/truncated so callers
// can fall back to the previous "not determined" behavior.
export function parseAXMLTree(buffer, strings) {
  try {
    if (!strings || !buffer) return null;
    var view = new DataView(buffer);
    var byteLength = buffer.byteLength;
    if (byteLength < 8) return null;

    var stringPoolChunkSize = view.getUint32(12, true);
    var pos = 8 + stringPoolChunkSize;
    if (pos <= 0 || pos + 8 > byteLength) return null;

    // Optional XML resource map chunk immediately follows the string pool.
    var peekType = view.getUint16(pos, true);
    if (peekType === RES_XML_RESOURCE_MAP_TYPE) {
      var mapSize = view.getUint32(pos + 4, true);
      if (mapSize <= 0) return null;
      pos += mapSize;
    }

    var applicationAttrs = null;
    var usesSdkAttrs = null;
    var exportedComponentCount = 0;
    var stack = [];
    var iterations = 0;

    while (pos + 8 <= byteLength && iterations < 200000) {
      iterations++;
      var chunkType = view.getUint16(pos, true);
      var chunkSize = view.getUint32(pos + 4, true);
      if (chunkSize <= 0 || pos + chunkSize > byteLength) break;

      if (chunkType === RES_XML_START_ELEMENT_TYPE) {
        var bodyStart = pos + 16;
        if (bodyStart + 16 > byteLength) break;
        var nameRef = view.getUint32(bodyStart + 4, true);
        var attributeStart = view.getUint16(bodyStart + 8, true);
        var attributeCount = view.getUint16(bodyStart + 12, true);
        var elemName = resolveAXMLString(strings, nameRef);
        var attrsBase = bodyStart + attributeStart;
        var attrs = {};

        for (var ai = 0; ai < attributeCount; ai++) {
          var attrOff = attrsBase + ai * 20;
          if (attrOff + 20 > byteLength) break;
          var attrNameRef = view.getUint32(attrOff + 4, true);
          var attrRawValueRef = view.getUint32(attrOff + 8, true);
          var attrDataType = view.getUint8(attrOff + 15);
          var attrData = view.getUint32(attrOff + 16, true);
          var attrName = resolveAXMLString(strings, attrNameRef);
          if (attrName) {
            attrs[attrName] = resolveAXMLAttrValue(strings, attrRawValueRef, attrDataType, attrData);
          }
        }

        if (elemName === 'application' && !applicationAttrs) applicationAttrs = attrs;
        if (elemName === 'uses-sdk' && !usesSdkAttrs) usesSdkAttrs = attrs;
        if (elemName === 'intent-filter' && stack.length) stack[stack.length - 1].hasIntentFilter = true;

        stack.push({
          name: elemName,
          hasExportedAttr: Object.prototype.hasOwnProperty.call(attrs, 'exported'),
          exportedValue: attrs.exported,
          hasIntentFilter: false,
        });
      } else if (chunkType === RES_XML_END_ELEMENT_TYPE) {
        var popped = stack.pop();
        if (popped && (popped.name === 'activity' || popped.name === 'service' || popped.name === 'receiver' || popped.name === 'provider')) {
          var isExported;
          if (popped.hasExportedAttr) {
            isExported = popped.exportedValue === true || String(popped.exportedValue).toLowerCase() === 'true';
          } else {
            isExported = popped.hasIntentFilter;
          }
          if (isExported) exportedComponentCount++;
        }
      }
      // START_NAMESPACE / END_NAMESPACE / CDATA chunks carry no data we need;
      // just skip over them via the generic chunkSize advance below.
      pos += chunkSize;
    }

    return {
      applicationAttrs: applicationAttrs,
      usesSdkAttrs: usesSdkAttrs,
      exportedComponentCount: exportedComponentCount,
    };
  } catch (error) {
    console.warn('AXML tree parse error:', error);
    return null;
  }
}

function toBoolAttr(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

// Derives the same risk-relevant fields parseTextManifest produces, but from
// a real binary AXML tree walk instead of a flat string-pool scan. Falls
// back to null per-field (not the whole result) only when the underlying
// element genuinely could not be located.
function deriveManifestFlagsFromTree(tree) {
  var appAttrs = tree && tree.applicationAttrs;
  var sdkAttrs = tree && tree.usesSdkAttrs;

  var debuggable = appAttrs ? toBoolAttr(appAttrs.debuggable, false) : null;
  var allowBackup = appAttrs ? toBoolAttr(appAttrs.allowBackup, true) : null;

  var targetSdkVersion = sdkAttrs && sdkAttrs.targetSdkVersion !== undefined ? String(sdkAttrs.targetSdkVersion) : null;
  var minSdkVersion = sdkAttrs && sdkAttrs.minSdkVersion !== undefined ? String(sdkAttrs.minSdkVersion) : null;

  var usesCleartextTraffic = null;
  if (appAttrs) {
    if (appAttrs.usesCleartextTraffic !== undefined) {
      usesCleartextTraffic = toBoolAttr(appAttrs.usesCleartextTraffic, true);
    } else if (Object.prototype.hasOwnProperty.call(appAttrs, 'networkSecurityConfig')) {
      usesCleartextTraffic = false;
    } else {
      var targetSdkNum = targetSdkVersion !== null ? parseInt(targetSdkVersion, 10) : NaN;
      usesCleartextTraffic = isNaN(targetSdkNum) ? true : targetSdkNum < 28;
    }
  }

  return {
    debuggable: debuggable,
    allowBackup: allowBackup,
    usesCleartextTraffic: usesCleartextTraffic,
    targetSdkVersion: targetSdkVersion,
    minSdkVersion: minSdkVersion,
    exportedComponentCount: tree ? tree.exportedComponentCount : null,
  };
}

export function categorizeFile(path) {
  if (path === 'AndroidManifest.xml') return 'manifest';
  if (/^classes\d*\.dex$/i.test(path)) return 'dex';
  if (path.indexOf('.smali') >= 0 || /\/smali\//i.test(path)) return 'smali';
  if (path.indexOf('res/') === 0) return 'resources';
  if (path.indexOf('assets/') === 0) return 'assets';
  if (path.indexOf('lib/') === 0) return 'libs';
  if (path.indexOf('META-INF/') === 0) return 'meta';
  if (path === 'resources.arsc' || path === 'apktool.yml') return 'meta';
  return 'other';
}

function getExtension(path) {
  var dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function isProtectedApkPath(path) {
  return path === 'AndroidManifest.xml'
    || path === 'resources.arsc'
    || /^classes\d*\.dex$/i.test(path)
    || path.indexOf('res/') === 0
    || path.indexOf('lib/') === 0
    || path.indexOf('META-INF/') === 0;
}

function shouldConsiderEditable(path, entry) {
  if (isProtectedApkPath(path)) return false;
  if (entry && entry.dir) return false;
  var d = entry && entry._data;
  var size = d ? (d.uncompressedSize || 0) : 0;
  if (size > MAX_EDITABLE_FILE_SIZE) return false;

  var ext = getExtension(path);
  if (SAFE_TEXT_EXTENSIONS[ext]) return true;
  if (path.indexOf('assets/') === 0) return true;
  return false;
}

function detectTextBuffer(buffer, path) {
  if (!path) path = '';
  var bytes = new Uint8Array(buffer.slice(0, MAX_TEXT_SCAN_BYTES));
  if (bytes.length === 0) return '';

  var nulls = 0;
  var suspicious = 0;
  for (var bi = 0; bi < bytes.length; bi++) {
    var b = bytes[bi];
    if (b === 0) nulls++;
    else if (b < 9 || (b > 13 && b < 32)) suspicious++;
  }

  var ext = getExtension(path);
  var isXmlish = ext === '.xml' || path.indexOf('.html') >= 0 || path.indexOf('.svg') >= 0;
  if (nulls > 0 && !isXmlish) return null;
  if (suspicious / bytes.length > 0.08) return null;

  var decoder = new TextDecoder('utf-8', { fatal: false });
  var txt = decoder.decode(bytes);
  if (!txt.trim()) return null;
  return txt;
}

function discoverEditablePaths(allFiles) {
  var editable = [];

  var chain = Promise.resolve();
  for (var fi = 0; fi < allFiles.length; fi++) {
    (function(file) {
      chain = chain.then(function() {
        if (!shouldConsiderEditable(file.path, file.entry)) return;
        return file.entry.async('arraybuffer').then(function(buffer) {
          var text = detectTextBuffer(buffer, file.path);
          if (text) editable.push(file.path);
        })['catch'](function() {});
      });
    })(allFiles[fi]);
  }

  return chain.then(function() {
    editable.sort(function(a, b) { return relevanceScore(b) - relevanceScore(a) || a.localeCompare(b); });
    return editable;
  });
}

function buildFileLookup(allFiles) {
  var map = {};
  for (var i = 0; i < allFiles.length; i++) {
    map[allFiles[i].path] = allFiles[i];
  }
  return map;
}

function shouldCompress(path) {
  var ext = getExtension(path);
  if (STORE_EXTENSIONS[ext]) return false;
  if (path.indexOf('META-INF/') === 0) return false;
  var base = path.split('/').pop();
  if (/^classes\d*\.dex$/i.test(base)) return false;
  if (path === 'AndroidManifest.xml' || path === 'resources.arsc') return false;
  return true;
}

function buildWriteOptions(path, originalEntry) {
  return {
    compression: shouldCompress(path) ? 'DEFLATE' : 'STORE',
    date: (originalEntry && originalEntry.date) || new Date(),
  };
}

export function extractAPK(file) {
  var rawInputBytes;
  return file.arrayBuffer().then(function(ab) {
    rawInputBytes = new Uint8Array(ab);
    return window.JSZip.loadAsync(rawInputBytes);
  }).then(function(loadedZip) {
    var zip = loadedZip;
    var fileName = file.name;
    var containerType = 'apk';
    var originalBytes = rawInputBytes;
    var analysisTargetPath = null;
    var containerDiagnostics = { warnings: [], apkEntryCount: 1, obbCount: 0, splitCount: 0 };

    return detectContainer(zip, fileName).then(function(containerInfo) {
      if (containerInfo) {
        containerType = containerInfo.type;
        containerDiagnostics = buildContainerDiagnostics(zip, containerInfo);
        return extractBaseFromContainer(zip, containerInfo).then(function(baseResult) {
          if (baseResult) {
            zip = baseResult.zip;
            fileName = baseResult.name;
            analysisTargetPath = baseResult.memberPath || baseResult.name;
          }
          return continueExtract(zip, fileName, containerType, containerDiagnostics, originalBytes, rawInputBytes, analysisTargetPath);
        });
      }
      return continueExtract(zip, fileName, containerType, containerDiagnostics, originalBytes, rawInputBytes, analysisTargetPath);
    });
  });
}

function continueExtract(zip, fileName, containerType, containerDiagnostics, originalBytes, rawInputBytes, analysisTargetPath) {
  var allFiles = [];
  var categories = { manifest: [], dex: [], smali: [], resources: [], assets: [], libs: [], meta: [], other: [] };

  zip.forEach(function(path, zipEntry) {
    if (zipEntry.dir) return;
    var category = categorizeFile(path);
    var entry = { path: path, category: category, entry: zipEntry };
    allFiles.push(entry);
    categories[category].push(entry);
  });

  categories.smali.sort(function(a, b) { return relevanceScore(b.path) - relevanceScore(a.path); });

  return discoverEditablePaths(allFiles).then(function(editablePaths) {
    return {
      zip: zip,
      allFiles: allFiles,
      categories: categories,
      containerType: containerType,
      containerDiagnostics: containerDiagnostics,
      fileName: fileName,
      originalBytes: originalBytes,
      sourcePackageBytes: rawInputBytes,
      analysisTargetPath: analysisTargetPath,
      editablePaths: editablePaths,
    };
  });
}

function detectContainer(zip, fileName) {
  var ext = (fileName || '').toLowerCase().split('.').pop();
  var names = [];
  zip.forEach(function(n) { names.push(n.toLowerCase()); });

  if (ext === 'xapk') return Promise.resolve({ type: 'xapk' });
  if (ext === 'apks') return Promise.resolve({ type: 'apks' });
  if (ext === 'aab') return Promise.resolve({ type: 'aab' });

  var hasManifest = zip.file('manifest.json');
  var hasApk = false;
  for (var i = 0; i < names.length; i++) {
    if (names[i].indexOf('.apk', names[i].length - 4) >= 0) { hasApk = true; break; }
  }
  if (hasManifest && hasApk) return Promise.resolve({ type: 'xapk' });

  var hasBase = false;
  for (var j = 0; j < names.length; j++) {
    if (names[j] === 'base.apk' || names[j].indexOf('/base.apk') >= 0) { hasBase = true; break; }
  }
  if (hasBase) return Promise.resolve({ type: 'apks' });

  var apkCount = 0;
  for (var k = 0; k < names.length; k++) {
    if (names[k].indexOf('.apk', names[k].length - 4) >= 0) apkCount++;
  }
  if (apkCount >= 2 && apkCount < 30) return Promise.resolve({ type: 'split-apk' });

  return Promise.resolve(null);
}

function extractBaseFromContainer(zip, containerInfo) {
  try {
    var baseEntries = zip.file(/(^|\/)base\.apk$/i);
    var baseEntry = baseEntries && baseEntries[0];

    if (!baseEntry && containerInfo.type === 'xapk') {
      var manifestEntry = zip.file('manifest.json');
      if (manifestEntry) {
        return manifestEntry.async('string').then(function(manifestStr) {
          try {
            var manifest = JSON.parse(manifestStr);
            var candidate = manifest.package_name
              ? manifest.package_name + '.apk'
              : null;
            if (!candidate && manifest.split_apks) {
              for (var si = 0; si < manifest.split_apks.length; si++) {
                if (manifest.split_apks[si].file) { candidate = manifest.split_apks[si].file; break; }
              }
            }
            if (candidate) {
              var found = zip.file(candidate);
              if (!found) {
                var regex = new RegExp('(^|/)' + candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
                var matches = zip.file(regex);
                found = matches && matches[0];
              }
              if (found) baseEntry = found;
            }
          } catch (e) {}
          return finishBaseExtraction(zip, baseEntry, containerInfo);
        })['catch'](function() { return finishBaseExtraction(zip, null, containerInfo); });
      }
    }

    return finishBaseExtraction(zip, baseEntry, containerInfo);
  } catch (error) {
    console.warn('Failed to extract base APK from container:', error);
    return Promise.resolve(null);
  }
}

function finishBaseExtraction(zip, baseEntry, containerInfo) {
  if (!baseEntry) {
    var apkEntries = zip.file(/\.apk$/i);
    if (apkEntries.length > 0) {
      baseEntry = apkEntries[0];
      for (var i = 1; i < apkEntries.length; i++) {
        var curD = apkEntries[i]._data;
        var bestD = baseEntry._data;
        var curSize = curD ? (curD.uncompressedSize || 0) : 0;
        var bestSize = bestD ? (bestD.uncompressedSize || 0) : 0;
        if (curSize > bestSize) baseEntry = apkEntries[i];
      }
    }
  }

  if (!baseEntry) return Promise.resolve(null);

  return baseEntry.async('arraybuffer').then(function(apkBuffer) {
    var bytes = new Uint8Array(apkBuffer);
    return window.JSZip.loadAsync(bytes).then(function(baseZip) {
      var baseName = baseEntry.name.split('/').pop() || 'base.apk';
      return { zip: baseZip, name: baseName, bytes: bytes, memberPath: baseEntry.name };
    });
  })['catch'](function(error) {
    console.warn('Failed to extract base APK from container:', error);
    return null;
  });
}

function buildContainerDiagnostics(zip, containerInfo) {
  var fileNames = [];
  zip.forEach(function(n) { fileNames.push(n); });
  var lowerNames = [];
  for (var i = 0; i < fileNames.length; i++) lowerNames.push(fileNames[i].toLowerCase());

  var apkEntries = [];
  var obbEntries = [];
  for (var j = 0; j < lowerNames.length; j++) {
    if (lowerNames[j].indexOf('.apk', lowerNames[j].length - 4) >= 0) apkEntries.push(lowerNames[j]);
    if (lowerNames[j].indexOf('.obb', lowerNames[j].length - 4) >= 0) obbEntries.push(lowerNames[j]);
  }
  var splitCount = 0;
  for (var k = 0; k < apkEntries.length; k++) {
    if (!/(^|\/)base\.apk$/i.test(apkEntries[k])) splitCount++;
  }
  var warnings = [];

  if (containerInfo.type === 'xapk') {
    warnings.push('Analysis was performed against the extracted base APK. Submit the exported handoff to the backend pipeline to preserve container-aware rebuild context.');
    if (obbEntries.length > 0) warnings.push('Detected ' + obbEntries.length + ' OBB file(s). Keep the original XAPK in the handoff so the backend can preserve companion assets.');
  }

  if (containerInfo.type === 'apks' || containerInfo.type === 'split-apk') {
    warnings.push('Detected ' + apkEntries.length + ' APK part(s). Analysis was run against the base APK member, so backend rebuild must target the original split set.');
  }

  if (containerInfo.type === 'aab') {
    warnings.push('Android App Bundle analysis is surface-only here. Final output must be produced by the backend bundletool workflow.');
  }

  return {
    warnings: warnings,
    apkEntryCount: apkEntries.length || 1,
    obbCount: obbEntries.length,
    splitCount: splitCount,
  };
}

function relevanceScore(path) {
  var lower = path.toLowerCase();
  var score = 0;
  if (lower.indexOf('assets/') === 0) score += 40;
  if (/config|settings|prefs|feature|flags|remote/.test(lower)) score += 80;
  if (/json|properties|yaml|toml|ini|cfg|conf/.test(lower)) score += 60;
  if (/index|bundle|main|app|webview|www/.test(lower)) score += 35;
  if (/premium|pro|subscription|billing|access/.test(lower)) score += 30;
  return score;
}

export function analyzeManifest(zip) {
  var entry = zip.file('AndroidManifest.xml');
  if (!entry) return Promise.resolve(null);

  return entry.async('arraybuffer').then(function(buffer) {
    var parsed = parseAXMLStrings(buffer);
    if (!parsed) return null;

    if (parsed.rawText) return parseTextManifest(parsed.rawText);

    var strings = parsed.strings;
    var pkg = 'unknown';
    for (var i = 0; i < strings.length; i++) {
      if (/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){1,}$/.test(strings[i])) { pkg = strings[i]; break; }
    }
    var versionName = '';
    for (var v = 0; v < strings.length; v++) {
      if (/^\d+\.\d/.test(strings[v]) && strings[v].length < 20) { versionName = strings[v]; break; }
    }

    // Attempt real binary attribute parsing to answer the risk-relevant
    // questions; on any failure (malformed/truncated buffer) this yields
    // null and every field below falls back to "not determined".
    var tree = parseAXMLTree(buffer, strings);
    var flags = deriveManifestFlagsFromTree(tree);

    return {
      'package': pkg,
      versionName: versionName,
      permissions: (function() { var r = []; for (var _p = 0; _p < strings.length; _p++) { if (strings[_p].indexOf('android.permission.') === 0 || strings[_p].indexOf('.permission.') >= 0) r.push(strings[_p]); } return r; })(),
      activities: (function() { var r = []; for (var _a = 0; _a < strings.length; _a++) { if (/^[A-Z]\w*Activity$/.test(strings[_a].split('.').pop()) || (strings[_a].charAt(0) === '.' && /Activity/.test(strings[_a]))) r.push(strings[_a]); } return r; })(),
      services: (function() { var r = []; for (var _sv = 0; _sv < strings.length; _sv++) { if (/Service$/.test(strings[_sv]) && strings[_sv].indexOf('.') >= 0) r.push(strings[_sv]); } return r; })(),
      receivers: (function() { var r = []; for (var _rv = 0; _rv < strings.length; _rv++) { if (/Receiver$/.test(strings[_rv]) && strings[_rv].indexOf('.') >= 0) r.push(strings[_rv]); } return r; })(),
      providers: (function() { var r = []; for (var _pr = 0; _pr < strings.length; _pr++) { if (/Provider$/.test(strings[_pr]) && strings[_pr].indexOf('.') >= 0) r.push(strings[_pr]); } return r; })(),
      strings: strings,
      debuggable: flags.debuggable,
      allowBackup: flags.allowBackup,
      usesCleartextTraffic: flags.usesCleartextTraffic,
      targetSdkVersion: flags.targetSdkVersion,
      minSdkVersion: flags.minSdkVersion,
      exportedComponentCount: flags.exportedComponentCount,
    };
  });
}

function parseTextManifest(xml) {
  function getAttr(tag, attr) {
    var re = new RegExp('<' + tag + '[^>]*' + attr + '\\s*=\\s*"([^"]*)"', 'i');
    var match = xml.match(re);
    return match ? match[1] : '';
  }

  var perms = [];
  var permRe = /android:name="(android\.permission\.\w+)"/g;
  var pm;
  while ((pm = permRe.exec(xml)) !== null) {
    perms.push(pm[1]);
  }

  var debuggableAttr = getAttr('application', 'android:debuggable');
  var debuggable = debuggableAttr ? debuggableAttr.toLowerCase() === 'true' : false;

  // android:allowBackup defaults to true per Android semantics when the
  // attribute is absent from <application>, so an empty match means "true".
  var allowBackupAttr = getAttr('application', 'android:allowBackup');
  var allowBackup = allowBackupAttr ? allowBackupAttr.toLowerCase() === 'true' : true;

  var cleartextAttr = getAttr('application', 'android:usesCleartextTraffic');
  var hasNetworkSecurityConfig = /android:networkSecurityConfig\s*=\s*"[^"]*"/i.test(xml);
  var usesCleartextTraffic = cleartextAttr
    ? cleartextAttr.toLowerCase() === 'true'
    : !hasNetworkSecurityConfig;

  var usesSdkMatch = xml.match(/<uses-sdk\b[^>]*>/i);
  var usesSdkTag = usesSdkMatch ? usesSdkMatch[0] : '';
  var targetSdkMatch = usesSdkTag.match(/android:targetSdkVersion\s*=\s*"([^"]*)"/i);
  var minSdkMatch = usesSdkTag.match(/android:minSdkVersion\s*=\s*"([^"]*)"/i);
  var targetSdkVersion = targetSdkMatch ? targetSdkMatch[1] : null;
  var minSdkVersion = minSdkMatch ? minSdkMatch[1] : null;

  return {
    'package': getAttr('manifest', 'package') || 'unknown',
    versionName: getAttr('manifest', 'android:versionName') || '',
    permissions: perms,
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    strings: [],
    debuggable: debuggable,
    allowBackup: allowBackup,
    usesCleartextTraffic: usesCleartextTraffic,
    targetSdkVersion: targetSdkVersion,
    minSdkVersion: minSdkVersion,
  };
}

var DANGEROUS_PERMISSIONS = [
  'SEND_SMS', 'RECEIVE_SMS', 'READ_SMS', 'CALL_PHONE', 'PROCESS_OUTGOING_CALLS',
  'READ_CONTACTS', 'READ_CALL_LOG', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
  'RECORD_AUDIO', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
  'SYSTEM_ALERT_WINDOW', 'REQUEST_INSTALL_PACKAGES', 'BIND_ACCESSIBILITY_SERVICE',
  'BIND_DEVICE_ADMIN', 'QUERY_ALL_PACKAGES',
];
var DANGEROUS_PERMISSIONS_SET = {};
for (var _dp = 0; _dp < DANGEROUS_PERMISSIONS.length; _dp++) DANGEROUS_PERMISSIONS_SET[DANGEROUS_PERMISSIONS[_dp]] = true;

// Permissions that warrant a "high" (rather than "medium") severity finding
// when present, since they enable particularly sensitive capabilities.
var HIGH_SEVERITY_PERMISSIONS_SET = {
  BIND_ACCESSIBILITY_SERVICE: true,
  BIND_DEVICE_ADMIN: true,
  SYSTEM_ALERT_WINDOW: true,
  REQUEST_INSTALL_PACKAGES: true,
};

export function assessManifestRisk(manifest) {
  var findings = [];
  if (!manifest) {
    return { level: 'low', findings: findings };
  }

  if (manifest.debuggable === true) {
    findings.push({
      id: 'debuggable',
      severity: 'high',
      label: 'App is debuggable',
      detail: 'android:debuggable="true" allows attaching a debugger to the running app in production, exposing internals and enabling runtime tampering.',
    });
  }

  if (manifest.usesCleartextTraffic === true) {
    findings.push({
      id: 'cleartext-traffic',
      severity: 'medium',
      label: 'Allows cleartext (unencrypted) network traffic',
      detail: 'android:usesCleartextTraffic="true" (or no networkSecurityConfig) permits plain HTTP, which can be intercepted or tampered with.',
    });
  }

  if (manifest.allowBackup === true || manifest.allowBackup === undefined) {
    findings.push({
      id: 'allow-backup',
      severity: 'low',
      label: 'Backup extraction (adb backup) allowed',
      detail: 'android:allowBackup is true (or unset, which defaults to true), allowing app data to be extracted via "adb backup" on debuggable/rooted devices.',
    });
  }

  var perms = manifest.permissions || [];
  var foundDangerous = [];
  for (var pi = 0; pi < perms.length; pi++) {
    var short = String(perms[pi]).replace(/^.*\.permission\./, '');
    if (DANGEROUS_PERMISSIONS_SET[short]) foundDangerous.push(short);
  }
  if (foundDangerous.length) {
    var hasHigh = false;
    for (var hi = 0; hi < foundDangerous.length; hi++) {
      if (HIGH_SEVERITY_PERMISSIONS_SET[foundDangerous[hi]]) { hasHigh = true; break; }
    }
    findings.push({
      id: 'dangerous-permissions',
      severity: hasHigh ? 'high' : 'medium',
      label: 'Requests ' + foundDangerous.length + ' sensitive permission(s)',
      detail: foundDangerous.join(', '),
    });
  }

  if (typeof manifest.exportedComponentCount === 'number' && manifest.exportedComponentCount > 3) {
    findings.push({
      id: 'exported-components',
      severity: 'medium',
      label: manifest.exportedComponentCount + ' exported component(s)',
      detail: 'Activities/services/receivers/providers with android:exported="true" (or implicitly exported via an <intent-filter> with no explicit exported="false") are reachable by other apps, widening the attack surface.',
    });
  }

  if (manifest.allowBackup === null || manifest.debuggable === null || manifest.usesCleartextTraffic === null) {
    findings.push({
      id: 'manifest-flags-undetermined',
      severity: 'low',
      label: 'Some manifest flags could not be determined',
      detail: 'debuggable/allowBackup/usesCleartextTraffic were not derivable from this binary manifest.',
    });
  }

  var highCount = 0;
  var mediumCount = 0;
  for (var fi = 0; fi < findings.length; fi++) {
    if (findings[fi].severity === 'high') highCount++;
    else if (findings[fi].severity === 'medium') mediumCount++;
  }

  var level = 'low';
  if (highCount > 0 || mediumCount >= 3) level = 'high';
  else if (mediumCount >= 1) level = 'medium';

  return { level: level, findings: findings };
}

export function readKeyFiles(zip, categories, editablePaths) {
  if (!editablePaths) editablePaths = [];
  var files = {};
  var selected = editablePaths.slice(0, 18);
  var chain = Promise.resolve();

  for (var i = 0; i < selected.length; i++) {
    (function(path) {
      chain = chain.then(function() {
        var entry = zip.file(path);
        if (!entry) return;

        return entry.async('arraybuffer').then(function(buffer) {
          var text = detectTextBuffer(buffer, path);
          if (!text) return;

          var fullText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          var content = fullText.slice(0, 2200);
          var category = categorizeFile(path);
          var methods;
          if (/\.(smali|js|mjs|cjs|kt|java)$/i.test(path)) {
            var methodMatches = fullText.match(/(?:function\s+|\.method\s+|fun\s+|class\s+)([A-Za-z0-9_$.]+)/g);
            methods = methodMatches ? (function() { var r = []; for (var mm = 0; mm < Math.min(methodMatches.length, 20); mm++) { r.push(methodMatches[mm].replace(/^(?:function\s+|\.method\s+|fun\s+|class\s+)/, '')); } return r; })() : undefined;
          }

          files[path] = {
            type: category,
            content: content,
            lines: fullText.split('\n').length,
            methods: methods,
          };
        })['catch'](function() {});
      });
    })(selected[i]);
  }

  return chain.then(function() { return files; });
}

export function buildAnalysisPrompt(manifest, keyFiles, stats, editablePaths) {
  if (!editablePaths) editablePaths = [];
  var prompt = 'APK structure analysis\n\n';
  if (manifest) {
    prompt += 'Package: ' + manifest['package'] + '\n';
    if (manifest.versionName) prompt += 'Version: ' + manifest.versionName + '\n';
    if (manifest.permissions.length) {
      prompt += 'Permissions (' + manifest.permissions.length + '):\n';
      var permsList = manifest.permissions.slice(0, 20);
      for (var pi = 0; pi < permsList.length; pi++) {
        prompt += '- ' + permsList[pi] + '\n';
      }
    }
    prompt += '\n';
  }

  prompt += 'File counts: ' + stats.smali + ' smali, ' + stats.resources + ' resources, ' + stats.assets + ' assets, ' + stats.libs + ' native libs, ' + stats.dex + ' DEX files\n';
  prompt += 'Editable packaged text files (' + editablePaths.length + '):\n';
  var shown = editablePaths.slice(0, 30);
  for (var ei = 0; ei < shown.length; ei++) {
    prompt += '- ' + shown[ei] + '\n';
  }
  prompt += '\n';

  var keyPaths = Object.keys(keyFiles);
  for (var ki = 0; ki < keyPaths.length; ki++) {
    var path = keyPaths[ki];
    var data = keyFiles[path];
    prompt += '=== ' + path + ' (' + (data.lines || '?') + ' lines) ===\n';
    var dm = data.methods;
    if (dm && dm.length) prompt += 'Methods: ' + dm.join(', ') + '\n';
    prompt += (data.content || '') + '\n\n';
  }

  return prompt;
}

function classifyFileChange(change, fileLookup, editableSet) {
  if (!change || !change.path || typeof change.content !== 'string' || change.content.trim().length === 0) {
    return { ok: false, reason: 'Missing file path or replacement content.' };
  }

  var file = fileLookup[change.path];
  if (!file) {
    return { ok: false, reason: 'Targets a file path not present in the uploaded APK.' };
  }

  if (isProtectedApkPath(change.path)) {
    return { ok: false, reason: 'Targets a compiled or protected APK file that this browser rebuild cannot safely rewrite.' };
  }

  if (!editableSet[change.path]) {
    return { ok: false, reason: 'Targets a packaged file that is not safely editable text.' };
  }

  return { ok: true, file: file };
}

export function validateModsAgainstAPK(mods, allFiles, editablePaths) {
  if (!editablePaths) editablePaths = [];
  var fileLookup = buildFileLookup(allFiles);
  var editableSet = {};
  for (var _ei = 0; _ei < editablePaths.length; _ei++) {
    editableSet[editablePaths[_ei]] = true;
  }
  var safeMods = [];
  var unsafeMods = [];

  for (var mi = 0; mi < (mods || []).length; mi++) {
    var mod = mods[mi];
    var reasons = [];
    var validChanges = [];

    for (var ci = 0; ci < (mod.fileChanges || []).length; ci++) {
      var change = mod.fileChanges[ci];
      var result = classifyFileChange(change, fileLookup, editableSet);
      if (result.ok) {
        var vc = { path: change.path, content: change.content, _originalEntry: result.file.entry };
        validChanges.push(vc);
      } else {
        reasons.push(result.reason);
      }
    }

    var uniqueReasons = [];
    var seenReasons = {};
    for (var ri = 0; ri < reasons.length; ri++) {
      if (!seenReasons[reasons[ri]]) {
        seenReasons[reasons[ri]] = true;
        uniqueReasons.push(reasons[ri]);
      }
    }
    // Build safeChanges manually instead of .filter()
    var validChangesFiltered = [];
    for (var vci = 0; vci < validChanges.length; vci++) {
      validChangesFiltered.push(validChanges[vci]);
    }

    if (validChanges.length > 0 && validChanges.length === (mod.fileChanges || []).length) {
      var safeMod = { id: mod.id, label: mod.label, description: mod.description, category: mod.category, fileChanges: validChanges, blocked: mod.blocked, isAiMod: mod.isAiMod, isAutoMod: mod.isAutoMod };
      if (mod.modSide) safeMod.modSide = mod.modSide;
      if (mod.difficulty) safeMod.difficulty = mod.difficulty;
      if (mod.targetFile) safeMod.targetFile = mod.targetFile;
      if (mod.lineRange) safeMod.lineRange = mod.lineRange;
      if (mod.diff) safeMod.diff = mod.diff;
      if (mod.instructions) safeMod.instructions = mod.instructions;
      if (mod.fridaScript) safeMod.fridaScript = mod.fridaScript;
      if (mod.modifiedContent) safeMod.modifiedContent = mod.modifiedContent;
      safeMods.push(safeMod);
    } else {
      var normalized = { id: mod.id, label: mod.label, description: mod.description, category: mod.category, fileChanges: mod.fileChanges, blocked: mod.blocked, isAiMod: mod.isAiMod, isAutoMod: mod.isAutoMod, blockedReasons: uniqueReasons, validChanges: validChanges };
      if (mod.modSide) normalized.modSide = mod.modSide;
      if (mod.difficulty) normalized.difficulty = mod.difficulty;
      if (mod.targetFile) normalized.targetFile = mod.targetFile;
      if (mod.lineRange) normalized.lineRange = mod.lineRange;
      if (mod.diff) normalized.diff = mod.diff;
      if (mod.instructions) normalized.instructions = mod.instructions;
      if (mod.fridaScript) normalized.fridaScript = mod.fridaScript;
      if (mod.modifiedContent) normalized.modifiedContent = mod.modifiedContent;
      unsafeMods.push(normalized);
    }
  }

  return {
    safeMods: safeMods,
    unsafeMods: unsafeMods,
    safeChangeCount: (function() { var sum = 0; for (var sc = 0; sc < safeMods.length; sc++) sum += safeMods[sc].fileChanges.length; return sum; })(),
    unsafeChangeCount: (function() { var sum = 0; for (var uc = 0; uc < unsafeMods.length; uc++) sum += Math.max(1, (unsafeMods[uc].fileChanges || []).length - unsafeMods[uc].validChanges.length); return sum; })(),
  };
}

export function applyModsToZIP(zip, mods) {
  var count = 0;

  for (var mi = 0; mi < (mods || []).length; mi++) {
    var mod = mods[mi];
    for (var ci = 0; ci < (mod.fileChanges || []).length; ci++) {
      var change = mod.fileChanges[ci];
      zip.file(change.path, change.content, buildWriteOptions(change.path, change._originalEntry));
      count++;
    }
  }

  return count;
}

export function buildPatchedZip(originalBytes, allFiles, editablePaths, mods) {
  var validation = validateModsAgainstAPK(mods, allFiles, editablePaths);
  return window.JSZip.loadAsync(originalBytes).then(function(zip) {
    var filesChanged = applyModsToZIP(zip, validation.safeMods);
    return {
      zip: zip,
      filesChanged: filesChanged,
      safeMods: validation.safeMods,
      unsafeMods: validation.unsafeMods,
    };
  });
}

export function downloadAPK(zip, filename, options) {
  if (!options) options = {};
  return signAPK(zip, { packageName: options.packageName }).then(function(signedBytes) {
    return verifySignedApkBytes(signedBytes).then(function(verification) {
      if (!verification.ok) {
        throw new Error('Signed APK verification failed: ' + verification.errors.join(' '));
      }

      var blob = new Blob([signedBytes], { type: 'application/vnd.android.package-archive' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 10000);

      return verification;
    });
  });
}
