(function () {
  'use strict';

  var W = window.FomoxaWire;
  var app = document.getElementById('inspector');
  if (!W || !app) return;

  var vi = document.documentElement.getAttribute('lang') === 'vi';
  var RENDER_LIMIT = 4096;

  var T = vi ? {
    ok: 'Hợp lệ',
    bytes: 'byte',
    total: 'Tổng',
    meta: '0 byte metadata',
    empty: '0 byte - không có gì trên wire',
    hexIdle: 'Di chuột lên field hoặc byte',
    encodeTitle: 'Output · RFC-0002',
    decodeTitle: 'Input đã decode',
    absent: 'không có dữ liệu - version skew, đọc thành giá trị zero',
    trailingModel: 'bị bỏ qua - version skew (writer có thêm field ở cuối)',
    trailingOther: 'thừa - không thuộc giá trị nào',
    trailing: '(byte thừa)',
    rejected: 'Bị từ chối',
    decodedOk: 'Decode thành công',
    consumed: 'đã đọc',
    skewNote: 'field không có dữ liệu',
    truncated: 'Chỉ hiển thị {n} byte đầu tiên.',
    same: 'Giống hệt nhau với input này. Lỗi này không lộ ra ở giá trị hiện tại - thử: ',
    sameBytes: 'Giống hệt từng byte. Implementation của bạn khớp RFC-0002 với input này.',
    differs: 'Khác nhau tại offset {at}{owner}. Đúng: {a} byte · So sánh: {b} byte.',
    inside: ' (trong {f})',
    pasteHint: 'Dán hex vào ô bên trên để so sánh.',
    cmpTitle: 'So sánh',
    cmpBytes: 'byte khác nhau',
    vector: 'vector'
  } : {
    ok: 'Valid',
    bytes: 'bytes',
    total: 'Total',
    meta: '0 bytes of metadata',
    empty: '0 bytes - nothing on the wire',
    hexIdle: 'Hover a field or a byte',
    encodeTitle: 'Output · RFC-0002',
    decodeTitle: 'Decoded input',
    absent: 'no data - version skew, reads as zero',
    trailingModel: 'ignored - version skew (the writer appended fields)',
    trailingOther: 'surplus - not part of the value',
    trailing: '(trailing bytes)',
    rejected: 'Rejected',
    decodedOk: 'Decoded',
    consumed: 'consumed',
    skewNote: 'absent fields',
    truncated: 'Showing the first {n} bytes.',
    same: 'Identical for this input. The bug does not show with this value - try: ',
    sameBytes: 'Byte-for-byte identical. Your implementation matches RFC-0002 for this input.',
    differs: 'First difference at offset {at}{owner}. Correct: {a} bytes · Compared: {b} bytes.',
    inside: ' (inside {f})',
    pasteHint: 'Paste hex above to compare.',
    cmpTitle: 'Compared',
    cmpBytes: 'bytes differ',
    vector: 'vector'
  };

  var BUG_TEXT = vi ? {
    bigEndian: ['Big-endian', 'Ghi số nhiều byte theo big-endian.', 'u32 · 0x12345678'],
    charLength: ['Độ dài theo ký tự', 'Tiền tố độ dài của String đếm ký tự thay vì byte UTF-8.', 'String · "中"'],
    memLayout: ['Chép layout bộ nhớ', 'Ghi struct như trong RAM, có padding để căn lề.', 'model Mixed'],
    sizeReorder: ['Compiler sắp lại field', 'Field được xếp theo kích thước giảm dần, như compiler tối ưu layout.', 'model Mixed'],
    sortFields: ['Sắp xếp field theo tên', 'Field lấy bằng reflection rồi sắp xếp theo alphabet "cho ổn định".', 'model Order { z: u8; a: u8 }'],
    arrayBytes: ['Count tính theo byte', 'Tiền tố của Array ghi số byte thay vì số phần tử.', 'Array<u32> · [1,2,3]'],
    enumByte: ['Enum 1 byte', 'Enum ít member bị "tối ưu" xuống u8.', 'enum PlayerState'],
    nanCanon: ['Chuẩn hoá NaN', 'Mọi NaN bị ghi thành NaN chuẩn, làm mất payload bit.', 'f32 · 0x7FC00001']
  } : {
    bigEndian: ['Big-endian', 'Multi-byte numbers written big-endian.', 'u32 · 0x12345678'],
    charLength: ['Length in characters', 'The String length prefix counts characters, not UTF-8 bytes.', 'String · "中"'],
    memLayout: ['Memory layout copy', 'The struct is written as it sits in RAM, alignment padding included.', 'model Mixed'],
    sizeReorder: ['Compiler field reorder', 'Fields laid out by descending size, as an optimizing compiler would.', 'model Mixed'],
    sortFields: ['Alphabetical fields', 'Fields pulled by reflection, then sorted by name "for stability".', 'model Order { z: u8; a: u8 }'],
    arrayBytes: ['Count in bytes', 'The Array prefix holds the byte length instead of the element count.', 'Array<u32> · [1,2,3]'],
    enumByte: ['One-byte enum', 'An enum with few members "optimized" down to a u8.', 'enum PlayerState'],
    nanCanon: ['NaN canonicalization', 'Every NaN rewritten to the canonical NaN, dropping its payload bits.', 'f32 · 0x7FC00001']
  };

  var GAME_SCHEMA = 'model Vector3 { x: f32; y: f32; z: f32 }\n\nmodel GameMessage {\n  playerId:   u32\n  playerName: String\n  position:   Vector3\n  health:     u32\n  isAlive:    bool\n}';
  var PRESETS = {
    player: { schema: 'model Player {\n  id:   u32\n  name: String\n}', type: 'Player', value: '{ id: 100, name: "Alice" }' },
    game: { schema: GAME_SCHEMA, type: 'GameMessage', value: '{\n  playerId: 42,\n  playerName: "Knight",\n  position: { x: 10.5, y: 20.3, z: -5.1 },\n  health: 100,\n  isAlive: true\n}' },
    u32: { schema: '', type: 'u32', value: '0x12345678' },
    f32: { schema: '', type: 'f32', value: '0x7FC00001' },
    string: { schema: '', type: 'String', value: '"Xin chào"' },
    array: { schema: '', type: 'Array<String>', value: '["a", "bc"]' },
    enumv: { schema: 'enum PlayerState { Idle = 0, Walk = 1, Run = 2, Jump = 3 }', type: 'PlayerState', value: 'Walk' },
    mixed: { schema: 'model Mixed { a: u8; b: u32; c: u8 }', type: 'Mixed', value: '{ a: 1, b: 2, c: 3 }' },
    skew: { schema: 'model ItemV2 {\n  id:   u32\n  name: String\n}', type: 'ItemV2', value: '{ id: 42, name: "Sword" }', mode: 'decode', hex: '2A 00 00 00' },
    reject: { schema: '', type: 'String', value: '"Alice"', mode: 'decode', hex: '64 00 00 00 41 6C 69 63 65' }
  };
  var BUG_PRESET = {
    bigEndian: 'u32', charLength: 'string', memLayout: 'mixed', sizeReorder: 'mixed',
    sortFields: { schema: 'model Order { z: u8; a: u8 }', type: 'Order', value: '{ z: 1, a: 2 }' },
    arrayBytes: { schema: '', type: 'Array<u32>', value: '[1, 2, 3]' },
    enumByte: 'enumv', nanCanon: 'f32'
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    schema: $('inSchema'), type: $('inType'), value: $('inValue'), hex: $('inHex'),
    valueCtl: $('ctlValue'), hexCtl: $('ctlHex'), typeList: $('typeList'),
    msg: $('inspMsg'), out: $('inspOut'),
    cmpWrap: $('cmpWrap'), cmpSel: $('cmpSel'), cmpDesc: $('cmpDesc'),
    cmpPasteCtl: $('ctlPaste'), cmpPaste: $('inPaste'), cmpOut: $('cmpOut')
  };
  var modeButtons = Array.prototype.slice.call(app.querySelectorAll('[data-mode]'));
  var presetButtons = Array.prototype.slice.call(app.querySelectorAll('[data-preset]'));
  var mode = 'encode';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
  function addr(n, w) { return n.toString(16).toUpperCase().padStart(w || 8, '0'); }
  function fmt(s, map) { return s.replace(/\{(\w+)\}/g, function (_, k) { return map[k]; }); }

  function showMsg(target, kind, html) {
    target.className = 'msg msg-' + kind;
    target.innerHTML = html;
    target.hidden = false;
  }

  function errorHtml(err) {
    var v = err.detail && err.detail.vector ? ' · ' + T.vector + ' ' + esc(err.detail.vector) : '';
    return '<b>' + esc(err.code) + '</b>' + v + ' - ' + esc(err.message);
  }

  function ownerMap(len, segs) {
    var owner = new Array(len);
    segs.forEach(function (s, idx) {
      for (var k = s.start; k < s.start + s.len && k < len; k++) owner[k] = idx;
    });
    return owner;
  }

  function hexPanel(title, bytes, segs, extra) {
    extra = extra || {};
    var owner = ownerMap(bytes.length, segs);
    var shown = Math.min(bytes.length, RENDER_LIMIT);
    var rows = '';
    for (var r = 0; r < shown; r += 16) {
      var cells = '';
      for (var k = r; k < Math.min(r + 16, shown); k++) {
        var seg = owner[k] !== undefined ? segs[owner[k]] : null;
        var cls = 'cell';
        if (extra.diff && extra.diff[k]) cls += ' diff';
        if (extra.extra && k >= extra.extra) cls += ' extra';
        if (extra.errAt !== undefined && k >= extra.errAt) cls += ' err';
        cells += '<span class="' + cls + '" data-i="' + k + '" data-f="' + (seg ? seg.f : 'none') + '"' +
          (seg ? ' data-seg="' + owner[k] + '"' : '') + '>' + hex2(bytes[k]) + '</span>';
      }
      rows += '<div class="row"><span class="addr">' + addr(r) + '</span><span class="cells">' + cells + '</span></div>';
    }
    if (!bytes.length) rows = '<p class="map-empty">' + esc(T.empty) + '</p>';
    var note = bytes.length > RENDER_LIMIT ? '<p class="map-empty">' + esc(fmt(T.truncated, { n: RENDER_LIMIT })) + '</p>' : '';
    return '<div class="map-panel">' +
      '<div class="map-head"><span>' + esc(title) + ' · ' + bytes.length + ' ' + T.bytes + '</span>' +
      '<span class="map-status">' + (extra.status || esc(T.hexIdle)) + '</span></div>' +
      '<div class="map-body"><div class="rows">' + rows + '</div>' + note + '</div></div>';
  }

  function fieldList(segs, absent, trailing) {
    var items = segs.map(function (s, idx) {
      return '<button class="field" type="button" data-seg="' + idx + '" data-f="' + esc(s.f) + '">' +
        '<span class="fa">0x' + addr(s.start, 2) + '</span>' +
        '<span class="fn">' + esc(s.path || 'value') + '<span class="ft">' + esc(s.type) + ' · ' + esc(s.text) + '</span></span>' +
        '<span class="fs">' + s.len + ' B</span></button>';
    });
    (absent || []).forEach(function (p) {
      items.push('<div class="field absent" data-f="none"><span class="fa">-</span><span class="fn">' + esc(p) +
        '<span class="ft">' + esc(T.absent) + '</span></span><span class="fs">0 B</span></div>');
    });
    if (trailing) {
      items.push('<div class="field" data-f="pad"><span class="fa">0x' + addr(trailing.at, 2) + '</span><span class="fn">' +
        esc(T.trailing) + '<span class="ft">' + esc(trailing.text) + '</span></span><span class="fs">' + trailing.len + ' B</span></div>');
    }
    if (!items.length) return '';
    return '<div><div class="fields">' + items.join('') + '</div>' +
      '<div class="total"><span>' + T.total + '</span><span><b>' + (segs.reduce(function (a, s) { return Math.max(a, s.start + s.len); }, 0) + (trailing ? trailing.len : 0)) +
      ' ' + T.bytes + '</b> · ' + T.meta + '</span></div></div>';
  }

  function wireHover(container, segs) {
    var cells = Array.prototype.slice.call(container.querySelectorAll('.cell'));
    var fields = Array.prototype.slice.call(container.querySelectorAll('.field[data-seg]'));
    var status = container.querySelector('.map-status');
    var idle = status ? status.innerHTML : '';

    function focus(idx) {
      var s = segs[idx];
      cells.forEach(function (c) {
        var on = c.getAttribute('data-seg') === String(idx);
        c.classList.toggle('hot', on);
        c.classList.toggle('dim', !on);
      });
      fields.forEach(function (f) { f.classList.toggle('active', f.getAttribute('data-seg') === String(idx)); });
      if (status) status.textContent = '0x' + addr(s.start, 2) + ' · ' + s.len + ' B · ' + (s.path || 'value');
    }
    function clear() {
      cells.forEach(function (c) { c.classList.remove('hot', 'dim'); });
      fields.forEach(function (f) { f.classList.remove('active'); });
      if (status) status.innerHTML = idle;
    }
    fields.forEach(function (f) {
      var idx = +f.getAttribute('data-seg');
      f.addEventListener('mouseenter', function () { focus(idx); });
      f.addEventListener('focus', function () { focus(idx); });
      f.addEventListener('mouseleave', clear);
      f.addEventListener('blur', clear);
    });
    cells.forEach(function (c) {
      c.addEventListener('mouseenter', function () {
        var idx = c.getAttribute('data-seg');
        if (idx !== null) focus(+idx); else clear();
      });
    });
    var body = container.querySelector('.rows');
    if (body) body.addEventListener('mouseleave', clear);
  }

  function readInputs() {
    var schema = W.parseSchema(el.schema.value);
    var type = W.parseType(el.type.value, schema);
    return { schema: schema, type: type };
  }

  function refreshTypeList() {
    var names = ['bool', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'u64', 'i64', 'f32', 'f64', 'String', 'Bytes', 'Array<u32>', 'Array<String>'];
    try {
      names = W.parseSchema(el.schema.value).order.concat(names);
    } catch (e) {}
    el.typeList.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  function setError(ctl, on) {
    [el.schema, el.type, el.value, el.hex].forEach(function (x) { x.parentNode.classList.remove('has-error'); });
    if (on && ctl) ctl.parentNode.classList.add('has-error');
  }

  function fieldFor(err) {
    if (err.code === 'Schema') return /unknown type/.test(err.message) && !/field/.test(err.message) ? el.type : el.schema;
    if (err.code === 'Hex') return el.hex;
    return mode === 'encode' ? el.value : el.hex;
  }

  var lastA = null;

  function run() {
    el.cmpOut.innerHTML = '';
    lastA = null;
    var inputs;
    try {
      inputs = readInputs();
    } catch (err) {
      if (!err.code) throw err;
      setError(fieldFor(err), true);
      showMsg(el.msg, 'err', errorHtml(err));
      el.out.innerHTML = '';
      el.cmpWrap.hidden = mode !== 'encode';
      return;
    }
    if (mode === 'encode') runEncode(inputs); else runDecode(inputs);
    saveHash();
  }

  function runEncode(inputs) {
    el.cmpWrap.hidden = false;
    var res;
    try {
      res = W.encode(inputs.schema, inputs.type, el.value.value);
    } catch (err) {
      if (!err.code) throw err;
      setError(fieldFor(err), true);
      showMsg(el.msg, 'err', errorHtml(err));
      el.out.innerHTML = '';
      return;
    }
    setError(null, false);
    lastA = res;
    showMsg(el.msg, 'ok', '<b>' + T.ok + '</b> · ' + esc(W.typeName(inputs.type)) + ' → ' + res.bytes.length + ' ' + T.bytes);
    el.out.innerHTML = hexPanel(T.encodeTitle, res.bytes, res.segs) + fieldList(res.segs);
    wireHover(el.out, res.segs);
    runCompare(inputs);
  }

  function runDecode(inputs) {
    el.cmpWrap.hidden = true;
    var bytes;
    try {
      bytes = W.parseHex(el.hex.value);
    } catch (err) {
      setError(el.hex, true);
      showMsg(el.msg, 'err', errorHtml(err));
      el.out.innerHTML = '';
      return;
    }
    setError(null, false);
    var res = W.decode(inputs.schema, inputs.type, bytes);
    var trailing = null;
    var extra = {};
    if (res.error) {
      setError(el.hex, true);
      showMsg(el.msg, 'err', '<b>' + T.rejected + '</b> · ' + errorHtml(res.error));
      extra.errAt = res.error.detail && res.error.detail.at !== undefined ? res.error.detail.at : res.consumed;
    } else {
      var parts = ['<b>' + T.decodedOk + '</b> · ' + res.consumed + '/' + bytes.length + ' ' + T.bytes + ' ' + T.consumed];
      if (res.absent.length) parts.push(res.absent.length + ' ' + T.skewNote);
      showMsg(el.msg, res.absent.length || res.trailing ? 'warn' : 'ok', parts.join(' · ') +
        '<br>' + esc(res.value));
      if (res.trailing) {
        trailing = { at: res.consumed, len: res.trailing, text: inputs.type.k === 'model' ? T.trailingModel : T.trailingOther };
      }
    }
    el.out.innerHTML = hexPanel(T.decodeTitle, bytes, res.segs, extra) + fieldList(res.segs, res.absent, trailing);
    wireHover(el.out, res.segs);
  }

  function runCompare(inputs) {
    var choice = el.cmpSel.value;
    el.cmpPasteCtl.hidden = choice !== 'paste';
    el.cmpDesc.hidden = !BUG_TEXT[choice];
    if (BUG_TEXT[choice]) {
      var bug = W.BUGS.filter(function (b) { return b.id === choice; })[0];
      el.cmpDesc.innerHTML = esc(BUG_TEXT[choice][1]) + ' <code>' + bug.vector + '</code>';
    }
    if (!choice || !lastA) return;
    var a = lastA;
    var b;
    var title;
    if (choice === 'paste') {
      if (!el.cmpPaste.value.trim()) {
        el.cmpOut.innerHTML = '<p class="msg">' + esc(T.pasteHint) + '</p>';
        return;
      }
      try {
        b = { bytes: W.parseHex(el.cmpPaste.value), segs: null };
      } catch (err) {
        el.cmpOut.innerHTML = '<p class="msg msg-err">' + errorHtml(err) + '</p>';
        return;
      }
      title = T.cmpTitle;
    } else {
      var opts = {};
      opts[choice] = true;
      try {
        b = W.encode(inputs.schema, inputs.type, el.value.value, opts);
      } catch (err) {
        el.cmpOut.innerHTML = '<p class="msg msg-err">' + errorHtml(err) + '</p>';
        return;
      }
      title = BUG_TEXT[choice][0];
    }
    var diff = {};
    var first = -1;
    var count = 0;
    var n = Math.max(a.bytes.length, b.bytes.length);
    for (var k = 0; k < n; k++) {
      if (a.bytes[k] !== b.bytes[k]) {
        diff[k] = true;
        count++;
        if (first < 0) first = k;
      }
    }
    var segs = b.segs || a.segs.filter(function (s) { return s.start < b.bytes.length; });
    var summary;
    if (first < 0) {
      summary = '<p class="msg msg-ok"><b>' + (choice === 'paste' ? esc(T.sameBytes) : esc(T.same) + '<code>' + esc(BUG_TEXT[choice][2]) + '</code>') + '</b></p>';
    } else {
      var own = a.segs.filter(function (s) { return first >= s.start && first < s.start + s.len; })[0];
      summary = '<p class="msg msg-err">' + fmt(esc(T.differs), {
        at: '<b>0x' + addr(first, 2) + '</b>',
        owner: own ? fmt(esc(T.inside), { f: '<code>' + esc(own.path || 'value') + '</code>' }) : '',
        a: a.bytes.length,
        b: b.bytes.length
      }) + '</p>';
    }
    var status = count ? '<b>' + count + ' ' + esc(T.cmpBytes) + '</b>' : '';
    el.cmpOut.innerHTML = summary + '<div class="insp-out">' +
      hexPanel(title, b.bytes, segs, { diff: diff, extra: a.bytes.length < b.bytes.length ? a.bytes.length : undefined, status: status }) +
      (b.segs ? fieldList(b.segs) : '') + '</div>';
    wireHover(el.cmpOut, segs);
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false'); });
    el.valueCtl.hidden = mode !== 'encode';
    el.hexCtl.hidden = mode !== 'decode';
    if (mode === 'decode' && !el.hex.value.trim() && lastA) {
      el.hex.value = W.hexList(lastA.bytes);
    }
  }

  function applyPreset(name) {
    var p = typeof name === 'string' ? PRESETS[name] : name;
    if (!p) return;
    el.schema.value = p.schema;
    el.type.value = p.type;
    el.value.value = p.value;
    el.hex.value = p.hex || '';
    presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-preset') === name ? 'true' : 'false'); });
    refreshTypeList();
    if (p.mode === 'decode') {
      setMode('decode');
    } else {
      setMode('encode');
      el.hex.value = '';
    }
    run();
  }

  var hashTimer = null;
  function saveHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var params = new URLSearchParams();
      params.set('mode', mode);
      if (el.schema.value.trim()) params.set('s', el.schema.value);
      params.set('t', el.type.value);
      if (mode === 'encode') params.set('v', el.value.value); else params.set('h', el.hex.value);
      if (el.cmpSel.value && mode === 'encode') params.set('cmp', el.cmpSel.value);
      try { history.replaceState(null, '', '#' + params.toString()); } catch (e) {}
    }, 300);
  }

  function loadHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    if (params.get('preset') && PRESETS[params.get('preset')]) {
      applyPreset(params.get('preset'));
      return;
    }
    if (!params.has('t')) {
      applyPreset('game');
      return;
    }
    el.schema.value = params.get('s') || '';
    el.type.value = params.get('t') || '';
    el.value.value = params.get('v') || '';
    el.hex.value = params.get('h') || '';
    var cmp = params.get('cmp');
    if (cmp && el.cmpSel.querySelector('option[value="' + cmp + '"]')) el.cmpSel.value = cmp;
    refreshTypeList();
    setMode(params.get('mode') === 'decode' ? 'decode' : 'encode');
    run();
  }

  el.cmpSel.innerHTML = el.cmpSel.innerHTML + W.BUGS.map(function (b) {
    return '<option value="' + b.id + '">' + esc(BUG_TEXT[b.id][0]) + ' · ' + b.vector + '</option>';
  }).join('');

  var inputTimer = null;
  function onInput() {
    presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    clearTimeout(inputTimer);
    inputTimer = setTimeout(run, 120);
  }
  [el.schema, el.type, el.value, el.hex, el.cmpPaste].forEach(function (x) { x.addEventListener('input', onInput); });
  el.schema.addEventListener('change', refreshTypeList);
  el.cmpSel.addEventListener('change', function () {
    var preset = BUG_PRESET[el.cmpSel.value];
    var current = null;
    try { current = readInputs(); } catch (e) {}
    if (preset && current && lastA) {
      var opts = {};
      opts[el.cmpSel.value] = true;
      var same = false;
      try { same = W.hexList(W.encode(current.schema, current.type, el.value.value, opts).bytes) === W.hexList(lastA.bytes); } catch (e) {}
      if (same) {
        var keep = el.cmpSel.value;
        applyPreset(preset);
        el.cmpSel.value = keep;
      }
    }
    run();
  });
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      setMode(b.getAttribute('data-mode'));
      run();
    });
  });
  presetButtons.forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });
  window.addEventListener('hashchange', function () {
    if (/preset=/.test(location.hash)) loadHash();
  });

  loadHash();
})();
