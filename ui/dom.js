// ui/dom.js - Shared DOM helpers and markdown rendering
var t = function(key, vals) {
  var i18n = window.miniappI18n;
  if (i18n && typeof i18n.t === 'function') {
    try { return i18n.t(key, vals); } catch (e) { return key; }
  }
  return key;
};

export { t };

export function $(sel, ctx) {
  if (!ctx) ctx = document;
  return ctx.querySelector(sel);
}

export function $$(sel, ctx) {
  if (!ctx) ctx = document;
  var nodes = ctx.querySelectorAll(sel);
  var result = [];
  for (var i = 0; i < nodes.length; i++) result.push(nodes[i]);
  return result;
}

export function el(tag, attrs) {
  var node = document.createElement(tag);
  if (!attrs) attrs = {};
  var keys = Object.keys(attrs);
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki];
    var v = attrs[k];
    if (k === 'className') node.className = v;
    else if (k.indexOf('on') === 0 && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') {
      var dk = Object.keys(v);
      for (var di = 0; di < dk.length; di++) { node.dataset[dk[di]] = v[dk[di]]; }
    }
    else if (k === 'html') node.innerHTML = v;
    else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
      else node.removeAttribute(k);
    }
    else node.setAttribute(k, v);
  }
  for (var ci = 2; ci < arguments.length; ci++) {
    var child = arguments[ci];
    if (child == null || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

// Simple markdown-like renderer for guide content
export function renderMarkdown(text) {
  var lines = text.split('\n');
  var html = [];
  var inCode = false;
  var codeLang = '';
  var codeBuf = [];
  var inTable = false;
  var tableBuf = [];

  function flushTable() {
    if (!inTable) return;
    var rows = [];
    for (var ri = 0; ri < tableBuf.length; ri++) {
      var cells = tableBuf[ri].split('|');
      var trimmed = [];
      for (var ci = 0; ci < cells.length; ci++) {
        var c = cells[ci].trim();
        if (c) trimmed.push(c);
      }
      rows.push(trimmed);
    }
    if (rows.length < 2) { html.push(tableBuf.join('<br>')); tableBuf = []; inTable = false; return; }
    var header = rows[0];
    var dataRows = rows.slice(2);
    var tbl = '<div class="overflow-x-auto my-3"><table class="w-full text-sm"><thead><tr>';
    for (var hi = 0; hi < header.length; hi++) {
      tbl += '<th class="text-left px-3 py-2 border-b border-white/10 text-cyan-300 font-semibold">' + inlineMd(header[hi]) + '</th>';
    }
    tbl += '</tr></thead><tbody>';
    for (var di = 0; di < dataRows.length; di++) {
      tbl += '<tr>';
      for (var dj = 0; dj < dataRows[di].length; dj++) {
        tbl += '<td class="px-3 py-2 border-b border-white/5 text-slate-300">' + inlineMd(dataRows[di][dj]) + '</td>';
      }
      tbl += '</tr>';
    }
    tbl += '</tbody></table></div>';
    html.push(tbl);
    tableBuf = [];
    inTable = false;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    if (trimmed.indexOf('```') === 0) {
      if (inCode) {
        html.push('<pre class="code-block"><code class="language-' + codeLang + '">' + escHtml(codeBuf.join('\n')) + '</code><button class="copy-btn" data-copy="' + encodeURIComponent(codeBuf.join('\n')) + '">' + t('app.common.copyCode') + '</button></pre>');
        codeBuf = []; inCode = false; codeLang = '';
      } else {
        flushTable();
        inCode = true; codeLang = trimmed.slice(3);
      }
      continue;
    }

    if (inCode) { codeBuf.push(line); continue; }

    if (trimmed.charAt(0) === '|' && trimmed.charAt(trimmed.length - 1) === '|') {
      if (!inTable) inTable = true;
      tableBuf.push(trimmed);
      continue;
    } else {
      flushTable();
    }

    if (trimmed.indexOf('### ') === 0) { html.push('<h4 class="text-base font-bold text-white mt-5 mb-2">' + inlineMd(trimmed.slice(4)) + '</h4>'); continue; }
    if (trimmed.indexOf('## ') === 0) { html.push('<h3 class="text-lg font-bold text-white mt-6 mb-2">' + inlineMd(trimmed.slice(3)) + '</h3>'); continue; }

    if (trimmed.indexOf('> ') === 0) {
      html.push('<blockquote class="border-l-2 border-cyan-400/50 pl-4 py-1 my-2 text-slate-400 text-sm italic">' + inlineMd(trimmed.slice(2)) + '</blockquote>');
      continue;
    }

    if (trimmed.indexOf('- [ ] ') === 0 || trimmed.indexOf('- [x] ') === 0) {
      var checked = trimmed.charAt(2) === 'x';
      html.push('<div class="flex items-start gap-2 my-1 text-sm"><span class="mt-0.5">' + (checked ? '&#9745;' : '&#9744;') + '</span><span class="text-slate-300">' + inlineMd(trimmed.slice(6)) + '</span></div>');
      continue;
    }

    if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
      html.push('<li class="ml-5 text-sm text-slate-300 my-0.5 list-disc">' + inlineMd(trimmed.slice(2)) + '</li>');
      continue;
    }

    var olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      html.push('<li class="ml-5 text-sm text-slate-300 my-0.5 list-decimal">' + inlineMd(olMatch[2]) + '</li>');
      continue;
    }

    if (!trimmed) { continue; }

    html.push('<p class="text-sm text-slate-300 my-2 leading-relaxed">' + inlineMd(trimmed) + '</p>');
  }
  flushTable();
  return html.join('\n');
}

function inlineMd(text) {
  return text
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function showToast(msg) {
  var toast = el('div', { className: 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-cyan-500 text-slate-950 font-semibold text-sm px-5 py-3 rounded-xl shadow-lg z-50 transition-all duration-300 opacity-0 translate-y-2' }, msg);
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.remove('opacity-0', 'translate-y-2'); });
  setTimeout(function() { toast.classList.add('opacity-0'); setTimeout(function() { toast.remove(); }, 300); }, 2000);
}
