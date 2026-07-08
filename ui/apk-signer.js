// ui/apk-signer.js - Browser APK signing V1+V2+V3 (ES5)

var CRLF = '\r\n';
var MAGIC = new TextEncoder().encode('APK Sig Block 42');
var V2_ID = 0x7109871a;
var V3_ID = 0xf05368c0;
var SIG_ALG_RSA_PKCS1_SHA256 = 0x0103;
var CHUNK_SIZE = 1024 * 1024;
var V3_MIN_SDK = 28;
var V3_MAX_SDK = 0x7fffffff;
var KEY_STORAGE_PREFIX = 'apk-signer-key:';

function concat() {
  var parts = [];
  for (var a = 0; a < arguments.length; a++) parts.push(arguments[a]);
  var arrays = [];
  for (var p = 0; p < parts.length; p++) {
    var part = parts[p];
    if (part instanceof Uint8Array) arrays.push(part);
    else if (Array.isArray(part)) arrays.push(new Uint8Array(part));
    else arrays.push(new Uint8Array(part));
  }
  var total = 0;
  for (var s = 0; s < arrays.length; s++) total += arrays[s].length;
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < arrays.length; j++) {
    out.set(arrays[j], offset);
    offset += arrays[j].length;
  }
  return out;
}

function u32(value) {
  var out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function u64(value) {
  var out = new Uint8Array(8);
  var view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  view.setUint32(4, Math.floor(value / 0x100000000) >>> 0, true);
  return out;
}

function r32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function r64(bytes, offset) {
  var view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getUint32(0, true) + view.getUint32(4, true) * 0x100000000;
}

function b64(bytes) {
  var text = '';
  for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text);
}

function fromB64(value) {
  var raw = atob(value);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function lp(data) {
  var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return concat(u32(bytes.length), bytes);
}

function lenBytes(length) {
  if (length < 0x80) return [length];
  if (length < 0x100) return [0x81, length];
  return [0x82, (length >> 8) & 0xff, length & 0xff];
}

function tlv(tag, data) {
  var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return concat([tag], lenBytes(bytes.length), bytes);
}

function seq(data) { return tlv(0x30, data); }
function setOf(data) { return tlv(0x31, data); }
function octetString(data) { return tlv(0x04, data); }
function bitString(data) { return tlv(0x03, concat([0x00], data)); }
function nullTag() { return new Uint8Array([0x05, 0x00]); }
function utf8(value) { return tlv(0x0c, new TextEncoder().encode(value)); }

function intValue(value) {
  if (value instanceof Uint8Array) {
    var i = 0;
    while (i < value.length - 1 && value[i] === 0) i++;
    var trimmed = value.slice(i);
    return tlv(0x02, (trimmed[0] & 0x80) ? concat([0x00], trimmed) : trimmed);
  }
  if (value === 0) return new Uint8Array([0x02, 0x01, 0x00]);
  var bytes = [];
  var n = Math.abs(value);
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00);
  return tlv(0x02, new Uint8Array(bytes));
}

function oid(value) {
  var parts = value.split('.').map(Number);
  var bytes = [parts[0] * 40 + parts[1]];
  for (var i = 2; i < parts.length; i++) {
    var part = parts[i];
    if (part < 128) {
      bytes.push(part);
      continue;
    }
    var stack = [];
    while (part > 0) {
      stack.unshift(part & 0x7f);
      part >>= 7;
    }
    for (var j = 0; j < stack.length - 1; j++) stack[j] |= 0x80;
    for (var k = 0; k < stack.length; k++) bytes.push(stack[k]);
  }
  return tlv(0x06, new Uint8Array(bytes));
}

function utcTime(date) {
  var iso = date.toISOString();
  var text = iso.slice(2, 10).replace(/-/g, '') + iso.slice(11, 19).replace(/:/g, '') + 'Z';
  return tlv(0x17, new TextEncoder().encode(text));
}

function algorithmIdentifier(oidValue) {
  return seq(concat(oid(oidValue), nullTag()));
}

function distinguishedName(commonName) {
  return seq(setOf(seq(concat(oid('2.5.4.3'), utf8(commonName)))));
}

function signerKeyName(packageName) {
  var safe = (packageName || 'shared').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 120);
  return KEY_STORAGE_PREFIX + safe;
}

function makeCertificate(privateKey, publicKeySpki) {
  var now = new Date();
  var tbs = seq(concat(
    tlv(0xa0, intValue(2)),
    intValue(1),
    algorithmIdentifier('1.2.840.113549.1.1.11'),
    distinguishedName('Miniapps APK Signer'),
    seq(concat(utcTime(now), utcTime(new Date(now.getTime() + 3650 * 86400000)))),
    distinguishedName('Miniapps APK Signer'),
    publicKeySpki,
  ));
  return crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, tbs).then(function(sig) {
    var signature = new Uint8Array(sig);
    return seq(concat(tbs, algorithmIdentifier('1.2.840.113549.1.1.11'), bitString(signature)));
  });
}

function makePkcs7(privateKey, cert, sfBytes) {
  return crypto.subtle.digest('SHA-256', sfBytes).then(function(dig) {
    var manifestDigest = new Uint8Array(dig);
    var attrs = concat(
      seq(concat(oid('1.2.840.113549.1.9.3'), setOf(oid('1.2.840.113549.1.7.1')))),
      seq(concat(oid('1.2.840.113549.1.9.4'), setOf(octetString(manifestDigest)))),
      seq(concat(oid('1.2.840.113549.1.9.5'), setOf(utcTime(new Date())))),
    );
    var signedAttrs = setOf(attrs);
    return crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, signedAttrs).then(function(sig) {
      var signature = new Uint8Array(sig);
      var signerInfo = seq(concat(
        intValue(1),
        seq(concat(distinguishedName('Miniapps APK Signer'), intValue(1))),
        algorithmIdentifier('2.16.840.1.101.3.4.2.1'),
        tlv(0xa0, attrs),
        algorithmIdentifier('1.2.840.113549.1.1.1'),
        octetString(signature),
      ));
      return seq(concat(
        oid('1.2.840.113549.1.7.2'),
        tlv(0xa0, seq(concat(
          intValue(1),
          setOf(algorithmIdentifier('2.16.840.1.101.3.4.2.1')),
          seq(oid('1.2.840.113549.1.7.1')),
          tlv(0xa0, cert),
          setOf(signerInfo),
        ))),
      ));
    });
  });
}

function createSigningIdentity() {
  return crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']).then(function(keyPair) {
    return crypto.subtle.exportKey('spki', keyPair.publicKey).then(function(spki) {
      var publicKeySpki = new Uint8Array(spki);
      return crypto.subtle.exportKey('jwk', keyPair.privateKey).then(function(jwk) {
        return makeCertificate(keyPair.privateKey, publicKeySpki).then(function(cert) {
          return {
            privateKey: keyPair.privateKey,
            privateKeyJwk: jwk,
            publicKeySpki: publicKeySpki,
            cert: cert,
          };
        });
      });
    });
  });
}

function loadPersistedSigningIdentity(packageName) {
  var storage = window.miniappsAI && window.miniappsAI.storage;
  if (!storage || !packageName) return Promise.resolve(null);

  return storage.getItem(signerKeyName(packageName)).then(function(raw) {
    if (!raw) return null;

    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.privateKeyJwk || !parsed.publicKeySpkiB64 || !parsed.certB64) return null;

      return crypto.subtle.importKey(
        'jwk',
        parsed.privateKeyJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
      ).then(function(privateKey) {
        return {
          privateKey: privateKey,
          publicKeySpki: fromB64(parsed.publicKeySpkiB64),
          cert: fromB64(parsed.certB64),
          fromStorage: true,
        };
      });
    } catch (error) {
      console.warn('Failed to load persisted signer identity:', error);
      return null;
    }
  })['catch'](function(error) {
    console.warn('Failed to load persisted signer identity:', error);
    return null;
  });
}

function persistSigningIdentity(packageName, identity) {
  var storage = window.miniappsAI && window.miniappsAI.storage;
  if (!storage || !packageName) return Promise.resolve();

  return storage.setItem(signerKeyName(packageName), JSON.stringify({
    packageName: packageName,
    createdAt: new Date().toISOString(),
    privateKeyJwk: identity.privateKeyJwk,
    publicKeySpkiB64: b64(identity.publicKeySpki),
    certB64: b64(identity.cert),
  }))['catch'](function(error) {
    console.warn('Failed to persist signer identity:', error);
  });
}

function getSigningIdentity(packageName) {
  return loadPersistedSigningIdentity(packageName).then(function(persisted) {
    if (persisted) return persisted;

    return createSigningIdentity().then(function(created) {
      return persistSigningIdentity(packageName, created).then(function() {
        return created;
      });
    });
  });
}

function v1Sign(zip, signingIdentity) {
  var staleMeta = [];
  zip.forEach(function(path) {
    if (path.indexOf('META-INF/') !== 0) return;
    var ext = path.split('.').pop().toUpperCase();
    if (path === 'META-INF/MANIFEST.MF' || ['SF', 'RSA', 'DSA', 'EC'].indexOf(ext) >= 0) staleMeta.push(path);
  });
  for (var si = 0; si < staleMeta.length; si++) zip.remove(staleMeta[si]);

  var entries = [];
  zip.forEach(function(path, entry) {
    if (!entry.dir && path.indexOf('META-INF/') !== 0) entries.push({ path: path, entry: entry });
  });
  entries.sort(function(a, b) { return a.path.localeCompare(b.path); });

  var digestChain = Promise.resolve([]);
  for (var ei = 0; ei < entries.length; ei++) {
    (function(e) {
      digestChain = digestChain.then(function(digests) {
        return e.entry.async('arraybuffer').then(function(data) {
          return crypto.subtle.digest('SHA-256', data).then(function(dig) {
            digests.push({ path: e.path, digest: b64(new Uint8Array(dig)) });
            return digests;
          });
        });
      });
    })(entries[ei]);
  }

  return digestChain.then(function(digests) {
    var manifest = 'Manifest-Version: 1.0' + CRLF + 'Created-By: 1.0 (Miniapps APK Signer)' + CRLF + CRLF;
    var sections = [];
    for (var di = 0; di < digests.length; di++) {
      var section = 'Name: ' + digests[di].path + CRLF + 'SHA-256-Digest: ' + digests[di].digest + CRLF + CRLF;
      manifest += section;
      sections.push({ path: digests[di].path, section: section });
    }
    zip.file('META-INF/MANIFEST.MF', manifest, { compression: 'STORE' });

    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(manifest)).then(function(mh) {
      var manifestHash = new Uint8Array(mh);
      var sf = 'Signature-Version: 1.0' + CRLF + 'Created-By: 1.0 (Miniapps APK Signer)' + CRLF + 'SHA-256-Digest-Manifest: ' + b64(manifestHash) + CRLF + CRLF;

      var sectionChain = Promise.resolve(sf);
      for (var si2 = 0; si2 < sections.length; si2++) {
        (function(sec) {
          sectionChain = sectionChain.then(function(sfAcc) {
            return crypto.subtle.digest('SHA-256', new TextEncoder().encode(sec.section)).then(function(sh) {
              var sectionHash = new Uint8Array(sh);
              return sfAcc + 'Name: ' + sec.path + CRLF + 'SHA-256-Digest: ' + b64(sectionHash) + CRLF + CRLF;
            });
          });
        })(sections[si2]);
      }

      return sectionChain.then(function(finalSf) {
        zip.file('META-INF/CERT.SF', finalSf, { compression: 'STORE' });
        return makePkcs7(signingIdentity.privateKey, signingIdentity.cert, new TextEncoder().encode(finalSf)).then(function(pkcs7) {
          zip.file('META-INF/CERT.RSA', pkcs7, { compression: 'STORE' });
        });
      });
    });
  });
}

function computeApkContentDigest(contentBytes) {
  var totalChunks = Math.max(1, Math.ceil(contentBytes.length / CHUNK_SIZE));
  var chunkChain = Promise.resolve([]);

  for (var i = 0; i < totalChunks; i++) {
    (function(idx) {
      chunkChain = chunkChain.then(function(chunkDigests) {
        var start = idx * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, contentBytes.length);
        var chunk = contentBytes.slice(start, end);
        var prefixed = concat([0x5a], u32(chunk.length), chunk);
        return crypto.subtle.digest('SHA-256', prefixed).then(function(d) {
          chunkDigests.push(new Uint8Array(d));
          return chunkDigests;
        });
      });
    })(i);
  }

  return chunkChain.then(function(chunkDigests) {
    var parts = [[0xa5], u32(chunkDigests.length)];
    for (var ci = 0; ci < chunkDigests.length; ci++) parts.push(chunkDigests[ci]);
    var finalInput = concat.apply(null, parts);
    return crypto.subtle.digest('SHA-256', finalInput).then(function(d) {
      return new Uint8Array(d);
    });
  });
}

function buildV2SignedData(digest, cert) {
  var digestRecord = concat(u32(SIG_ALG_RSA_PKCS1_SHA256), lp(digest));
  return concat(lp(lp(digestRecord)), lp(lp(cert)), lp(new Uint8Array(0)));
}

function buildV3SignedData(digest, cert, minSdk, maxSdk) {
  var digestRecord = concat(u32(SIG_ALG_RSA_PKCS1_SHA256), lp(digest));
  return concat(lp(lp(digestRecord)), lp(lp(cert)), u32(minSdk), u32(maxSdk), lp(new Uint8Array(0)));
}

function buildV2Signer(signedData, signatureBytes, publicKeySpki) {
  var signatureRecord = concat(u32(SIG_ALG_RSA_PKCS1_SHA256), lp(signatureBytes));
  return concat(lp(signedData), lp(lp(signatureRecord)), lp(publicKeySpki));
}

function buildV3Signer(signedData, signatureBytes, publicKeySpki, minSdk, maxSdk) {
  var signatureRecord = concat(u32(SIG_ALG_RSA_PKCS1_SHA256), lp(signatureBytes));
  return concat(lp(signedData), u32(minSdk), u32(maxSdk), lp(lp(signatureRecord)), lp(publicKeySpki));
}

function buildPair(id, value) {
  return concat(u64(4 + value.length), u32(id), value);
}

function findEOCD(bytes) {
  for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (r32(bytes, i) === 0x06054b50) return { offset: i, cdOffset: r32(bytes, i + 16) };
  }
  return null;
}

function hasSigningBlock(bytes, cdOffset) {
  if (cdOffset < 32) return false;
  for (var i = 0; i < 16; i++) {
    if (bytes[cdOffset - 16 + i] !== MAGIC[i]) return false;
  }
  return true;
}

function splitZipSections(bytes, eocd) {
  if (hasSigningBlock(bytes, eocd.cdOffset)) {
    var blockSize = r64(bytes, eocd.cdOffset - 24);
    var blockStart = eocd.cdOffset - blockSize - 8;
    return {
      entries: bytes.slice(0, blockStart),
      cd: bytes.slice(eocd.cdOffset, eocd.offset),
      eocdBytes: bytes.slice(eocd.offset),
    };
  }

  return {
    entries: bytes.slice(0, eocd.cdOffset),
    cd: bytes.slice(eocd.cdOffset, eocd.offset),
    eocdBytes: bytes.slice(eocd.offset),
  };
}

function estimateSigningBlockSize(cert, publicKeySpki) {
  var dummyDigest = new Uint8Array(32);
  var dummySignature = new Uint8Array(256);

  var v2SignedData = buildV2SignedData(dummyDigest, cert);
  var v2Signer = buildV2Signer(v2SignedData, dummySignature, publicKeySpki);
  var v2Pair = buildPair(V2_ID, lp(lp(v2Signer)));

  var v3SignedData = buildV3SignedData(dummyDigest, cert, V3_MIN_SDK, V3_MAX_SDK);
  var v3Signer = buildV3Signer(v3SignedData, dummySignature, publicKeySpki, V3_MIN_SDK, V3_MAX_SDK);
  var v3Pair = buildPair(V3_ID, lp(lp(v3Signer)));

  var pairsLength = v2Pair.length + v3Pair.length;
  var blockSizeFieldValue = pairsLength + 8 + 16;
  return 8 + blockSizeFieldValue;
}

function patchEocdCentralDirectoryOffset(eocdBytes, value) {
  var out = new Uint8Array(eocdBytes.length);
  out.set(eocdBytes);
  new DataView(out.buffer, out.byteOffset).setUint32(16, value, true);
  return out;
}

function v2v3Sign(rawBytes, signingIdentity) {
  var eocd = findEOCD(rawBytes);
  if (!eocd) return Promise.reject(new Error('ZIP EOCD not found'));

  var sections = splitZipSections(rawBytes, eocd);
  var totalBlockSize = estimateSigningBlockSize(signingIdentity.cert, signingIdentity.publicKeySpki);
  var signingBlockOffset = sections.entries.length;
  var newCdOffset = sections.entries.length + totalBlockSize;

  var digestEocd = patchEocdCentralDirectoryOffset(sections.eocdBytes, signingBlockOffset);
  var outputEocd = patchEocdCentralDirectoryOffset(sections.eocdBytes, newCdOffset);

  return computeApkContentDigest(concat(sections.entries, sections.cd, digestEocd)).then(function(contentDigest) {
    var v2SignedData = buildV2SignedData(contentDigest, signingIdentity.cert);
    return crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, signingIdentity.privateKey, v2SignedData).then(function(v2Sig) {
      var v2Signature = new Uint8Array(v2Sig);
      var v2Signer = buildV2Signer(v2SignedData, v2Signature, signingIdentity.publicKeySpki);
      var v2Pair = buildPair(V2_ID, lp(lp(v2Signer)));

      var v3SignedData = buildV3SignedData(contentDigest, signingIdentity.cert, V3_MIN_SDK, V3_MAX_SDK);
      return crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, signingIdentity.privateKey, v3SignedData).then(function(v3Sig) {
        var v3Signature = new Uint8Array(v3Sig);
        var v3Signer = buildV3Signer(v3SignedData, v3Signature, signingIdentity.publicKeySpki, V3_MIN_SDK, V3_MAX_SDK);
        var v3Pair = buildPair(V3_ID, lp(lp(v3Signer)));

        var pairs = concat(v2Pair, v3Pair);
        var blockSizeField = u64(pairs.length + 8 + 16);

        return concat(sections.entries, blockSizeField, pairs, blockSizeField, MAGIC, sections.cd, outputEocd);
      });
    });
  });
}

export function signAPK(zip, options) {
  if (!options) options = {};
  if (!(crypto && crypto.subtle)) return Promise.reject(new Error('Web Crypto API not available'));

  return getSigningIdentity(options.packageName || 'shared').then(function(signingIdentity) {
    return v1Sign(zip, signingIdentity).then(function() {
      return zip.generateAsync({ type: 'uint8array' }).then(function(rawBytes) {
        return v2v3Sign(rawBytes, signingIdentity);
      });
    });
  });
}

export function verifySignedApkBytes(bytes) {
  var uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var errors = [];
  var warnings = [];
  var details = {};

  var eocd = findEOCD(uint8);
  if (!eocd) {
    errors.push('ZIP end-of-central-directory record was not found.');
  } else {
    details.eocdOffset = eocd.offset;
    details.centralDirectoryOffset = eocd.cdOffset;

    if (eocd.cdOffset <= 0 || eocd.cdOffset >= eocd.offset) {
      errors.push('Central directory offset is invalid.');
    }

    if (!hasSigningBlock(uint8, eocd.cdOffset)) {
      warnings.push('APK Signing Block was not detected before the central directory.');
    } else {
      var footerSize = r64(uint8, eocd.cdOffset - 24);
      var blockStart = eocd.cdOffset - footerSize - 8;
      details.signingBlockOffset = blockStart;
      details.signingBlockSize = footerSize + 8;

      if (blockStart < 0 || blockStart >= eocd.cdOffset) {
        errors.push('APK Signing Block boundaries are invalid.');
      } else {
        var headerSize = r64(uint8, blockStart);
        if (headerSize !== footerSize) {
          errors.push('APK Signing Block header/footer sizes do not match.');
        }
      }
    }
  }

  return window.JSZip.loadAsync(uint8).then(function(zip) {
    var manifest = zip.file('META-INF/MANIFEST.MF');
    var sf = zip.file('META-INF/CERT.SF');
    var rsa = zip.file('META-INF/CERT.RSA');
    var fileCount = 0;
    zip.forEach(function(p, e) { if (!e.dir) fileCount++; });
    details.fileCount = fileCount;
    details.hasV1SignatureFiles = Boolean(manifest && sf && rsa);

    if (!details.hasV1SignatureFiles) {
      warnings.push('V1 signature companion files were not all found under META-INF/.');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings, details: details };
  })['catch'](function(error) {
    errors.push('Signed APK could not be reopened as a ZIP: ' + error.message);
    return { ok: false, errors: errors, warnings: warnings, details: details };
  });
}
