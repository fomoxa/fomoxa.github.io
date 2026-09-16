(function (global) {
  'use strict';

  var PRIMS = {
    bool: { size: 1, f: 'bool' },
    u8: { size: 1, bits: 8n, signed: false, f: 'int' },
    i8: { size: 1, bits: 8n, signed: true, f: 'int' },
    u16: { size: 2, bits: 16n, signed: false, f: 'int' },
    i16: { size: 2, bits: 16n, signed: true, f: 'int' },
    u32: { size: 4, bits: 32n, signed: false, f: 'int' },
    i32: { size: 4, bits: 32n, signed: true, f: 'int' },
    u64: { size: 8, bits: 64n, signed: false, f: 'int' },
    i64: { size: 8, bits: 64n, signed: true, f: 'int' },
    f32: { size: 4, float: true, f: 'float' },
    f64: { size: 8, float: true, f: 'float' }
  };

  var MAX_OUTPUT = 1 << 20;

  function WireError(code, message, detail) {
    var err = new Error(message);
    err.code = code;
    err.detail = detail || {};
    return err;
  }

  function stripComments(text) {
    return text.replace(/\/\/[^\n]*/g, '').replace(/#[^\n]*/g, '');
  }

  function parseSchema(text) {
    var schema = { models: {}, enums: {}, order: [] };
    var source = stripComments(text || '');
    var re = /\b(model|enum)\s+([A-Za-z_]\w*)\s*\{([^{}]*)\}/g;
    var leftover = source.replace(re, function (all, kind, name, body) {
      if (schema.models[name] || schema.enums[name]) {
        throw WireError('Schema', 'duplicate declaration: ' + name);
      }
      if (PRIMS[name] || /^(string|bytes|array)$/i.test(name)) {
        throw WireError('Schema', 'reserved type name: ' + name);
      }
      var parts = body.split(/[;,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (kind === 'model') {
        var fields = [];
        var seen = {};
        parts.forEach(function (part) {
          var m = /^([A-Za-z_]\w*)\s*:\s*(.+)$/.exec(part);
          if (!m) { throw WireError('Schema', 'expected "field: Type" in model ' + name + ', got "' + part + '"'); }
          if (seen[m[1]]) { throw WireError('Schema', 'duplicate field ' + name + '.' + m[1]); }
          seen[m[1]] = true;
          fields.push({ name: m[1], typeText: m[2].replace(/\s+/g, '') });
        });
        schema.models[name] = { name: name, fields: fields };
      } else {
        var members = [];
        var next = 0n;
        var names = {};
        parts.forEach(function (part) {
          var m = /^([A-Za-z_]\w*)\s*(?:=\s*(\S+))?$/.exec(part);
          if (!m) { throw WireError('Schema', 'expected "Member = value" in enum ' + name + ', got "' + part + '"'); }
          var value = m[2] !== undefined ? parseIntegerText(m[2]) : next;
          if (value === null || value < 0n || value > 0xFFFFFFFFn) {
            throw WireError('Schema', 'enum value out of UInt32 range: ' + name + '.' + m[1]);
          }
          if (names[m[1]]) { throw WireError('Schema', 'duplicate member ' + name + '.' + m[1]); }
          names[m[1]] = true;
          members.push({ name: m[1], value: value });
          next = value + 1n;
        });
        schema.enums[name] = { name: name, members: members };
      }
      schema.order.push(name);
      return ' ';
    });
    if (leftover.trim()) {
      throw WireError('Schema', 'unrecognised schema text: "' + leftover.trim().slice(0, 40) + '"');
    }
    Object.keys(schema.models).forEach(function (name) {
      schema.models[name].fields.forEach(function (field) {
        field.type = parseType(field.typeText, schema);
      });
    });
    checkCycles(schema);
    return schema;
  }

  function checkCycles(schema) {
    var state = {};
    function visit(name, trail) {
      if (state[name] === 2) { return; }
      if (state[name] === 1) {
        throw WireError('Schema', 'model contains itself inline: ' + trail.concat(name).join(' → '));
      }
      state[name] = 1;
      schema.models[name].fields.forEach(function (field) {
        if (field.type.k === 'model') { visit(field.type.name, trail.concat(name)); }
      });
      state[name] = 2;
    }
    Object.keys(schema.models).forEach(function (name) { visit(name, []); });
  }

  function parseType(text, schema) {
    var t = String(text).replace(/\s+/g, '');
    var arr = /^Array<(.+)>$/i.exec(t);
    if (arr) { return { k: 'array', of: parseType(arr[1], schema) }; }
    var lower = t.toLowerCase();
    if (PRIMS[lower]) { return { k: 'prim', name: lower, p: PRIMS[lower] }; }
    if (lower === 'string') { return { k: 'string' }; }
    if (lower === 'bytes') { return { k: 'bytes' }; }
    if (schema && schema.models[t]) { return { k: 'model', name: t }; }
    if (schema && schema.enums[t]) { return { k: 'enum', name: t }; }
    throw WireError('Schema', 'unknown type: ' + (t || '(empty)'));
  }

  function typeName(type) {
    switch (type.k) {
      case 'prim': return type.name;
      case 'string': return 'String';
      case 'bytes': return 'Bytes';
      case 'array': return 'Array<' + typeName(type.of) + '>';
      default: return type.name;
    }
  }

  function parseIntegerText(raw) {
    var s = String(raw).replace(/_/g, '').trim();
    var neg = false;
    if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    var v;
    if (/^0x[0-9a-f]+$/i.test(s)) { v = BigInt(s); }
    else if (/^0b[01]+$/i.test(s)) { v = BigInt(s); }
    else if (/^\d+$/.test(s)) { v = BigInt(s); }
    else { return null; }
    return neg ? -v : v;
  }

  function parseValue(text) {
    var src = String(text);
    var i = 0;

    function fail(msg) { throw WireError('Value', msg + ' at position ' + i); }
    function ws() {
      for (;;) {
        while (i < src.length && /\s/.test(src[i])) { i++; }
        if (src[i] === '/' && src[i + 1] === '/') {
          while (i < src.length && src[i] !== '\n') { i++; }
        } else { return; }
      }
    }
    function str(quote) {
      i++;
      var out = '';
      while (i < src.length && src[i] !== quote) {
        var c = src[i++];
        if (c === '\\') {
          var e = src[i++];
          if (e === 'n') { out += '\n'; }
          else if (e === 't') { out += '\t'; }
          else if (e === 'r') { out += '\r'; }
          else if (e === '0') { out += '\0'; }
          else if (e === 'u') {
            var hex;
            if (src[i] === '{') {
              var end = src.indexOf('}', i);
              if (end < 0) { fail('bad \\u{...} escape'); }
              hex = src.slice(i + 1, end);
              i = end + 1;
              var cp = parseInt(hex, 16);
              if (!/^[0-9a-f]{1,6}$/i.test(hex) || cp > 0x10FFFF) { fail('bad \\u{...} escape'); }
              out += String.fromCodePoint(cp);
            } else {
              hex = src.slice(i, i + 4);
              if (!/^[0-9a-f]{4}$/i.test(hex)) { fail('bad \\u escape'); }
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
            }
          } else if (e === undefined) { fail('unterminated string'); }
          else { out += e; }
        } else { out += c; }
      }
      if (src[i] !== quote) { fail('unterminated string'); }
      i++;
      return { t: 'str', v: out };
    }
    function value() {
      ws();
      var c = src[i];
      if (c === undefined) { fail('unexpected end of value'); }
      if (c === '"' || c === "'") { return str(c); }
      if (c === '[') {
        i++;
        var items = [];
        ws();
        while (src[i] !== ']') {
          items.push(value());
          ws();
          if (src[i] === ',') { i++; ws(); } else if (src[i] !== ']') { fail('expected , or ]'); }
        }
        i++;
        return { t: 'arr', items: items };
      }
      if (c === '{') {
        i++;
        var entries = [];
        ws();
        while (src[i] !== '}') {
          var key;
          if (src[i] === '"' || src[i] === "'") { key = str(src[i]).v; }
          else {
            var km = /^[A-Za-z_]\w*/.exec(src.slice(i));
            if (!km) { fail('expected field name'); }
            key = km[0];
            i += key.length;
          }
          ws();
          if (src[i] !== ':' && src[i] !== '=') { fail('expected : after ' + key); }
          i++;
          entries.push([key, value()]);
          ws();
          if (src[i] === ',' || src[i] === ';') { i++; ws(); } else if (src[i] !== '}') { fail('expected , or }'); }
        }
        i++;
        return { t: 'obj', entries: entries };
      }
      var num = /^[+-]?(?:0x[0-9a-f_]+|0b[01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:e[+-]?\d+)?)/i.exec(src.slice(i));
      if (num && num[0] !== '' && /\d/.test(num[0])) {
        i += num[0].length;
        return { t: 'num', raw: num[0] };
      }
      var id = /^[+-]?[A-Za-z_][\w.:]*/.exec(src.slice(i));
      if (id) {
        i += id[0].length;
        return { t: 'id', v: id[0] };
      }
      fail('unexpected character "' + c + '"');
    }

    var result = value();
    ws();
    if (i < src.length) { fail('unexpected trailing text'); }
    return result;
  }

  function Out(opts) {
    this.bytes = [];
    this.segs = [];
    this.opts = opts || {};
  }
  Out.prototype.push = function (arr, seg) {
    if (this.bytes.length + arr.length > MAX_OUTPUT) {
      throw WireError('Limit', 'output larger than 1 MiB');
    }
    var start = this.bytes.length;
    for (var k = 0; k < arr.length; k++) { this.bytes.push(arr[k]); }
    if (seg && arr.length) {
      seg.start = start;
      seg.len = arr.length;
      this.segs.push(seg);
    }
    return start;
  };

  function intBytes(v, size, bigEndian) {
    var bits = BigInt(size * 8);
    var u = BigInt.asUintN(Number(bits), v);
    var out = [];
    for (var k = 0; k < size; k++) {
      out.push(Number((u >> BigInt(k * 8)) & 0xFFn));
    }
    return bigEndian ? out.reverse() : out;
  }

  function checkRange(v, p, path) {
    var min = p.signed ? -(1n << (p.bits - 1n)) : 0n;
    var max = p.signed ? (1n << (p.bits - 1n)) - 1n : (1n << p.bits) - 1n;
    if (v < min || v > max) {
      throw WireError('Range', path + ': ' + v + ' is outside ' + min + '..' + max);
    }
  }

  function floatBits(node, size, path, opts) {
    var raw = node.t === 'num' ? node.raw : node.t === 'id' ? node.v : node.t === 'str' ? node.v : null;
    if (raw === null) { throw WireError('Type', path + ': expected a number'); }
    var bits;
    var text;
    var s = String(raw).trim();
    if (/^0x[0-9a-f_]+$/i.test(s)) {
      bits = BigInt(s.replace(/_/g, ''));
      if (bits >> BigInt(size * 8)) { throw WireError('Range', path + ': bit pattern wider than ' + size * 8 + ' bits'); }
    } else {
      var num;
      if (/^[+-]?(inf|infinity)$/i.test(s)) { num = s[0] === '-' ? -Infinity : Infinity; }
      else if (/^[+-]?nan$/i.test(s)) { num = NaN; }
      else {
        num = Number(s.replace(/_/g, ''));
        if (!/\d/.test(s) || isNaN(num)) { throw WireError('Type', path + ': "' + s + '" is not a number'); }
      }
      var dv = new DataView(new ArrayBuffer(8));
      if (size === 4) {
        dv.setFloat32(0, num, false);
        bits = BigInt(dv.getUint32(0, false));
      } else {
        dv.setFloat64(0, num, false);
        bits = dv.getBigUint64(0, false);
      }
      if (s[0] === '-' && /nan/i.test(s)) { bits |= 1n << BigInt(size * 8 - 1); }
    }
    if (opts.nanCanon && isNanBits(bits, size)) {
      var sign = bits >> BigInt(size * 8 - 1);
      bits = size === 4 ? 0x7FC00000n : 0x7FF8000000000000n;
      if (sign) { bits |= 1n << BigInt(size * 8 - 1); }
    }
    text = formatFloat(bits, size);
    return { bits: bits, text: text };
  }

  function isNanBits(bits, size) {
    if (size === 4) { return ((bits >> 23n) & 0xFFn) === 0xFFn && (bits & 0x7FFFFFn) !== 0n; }
    return ((bits >> 52n) & 0x7FFn) === 0x7FFn && (bits & 0xFFFFFFFFFFFFFn) !== 0n;
  }

  function formatFloat(bits, size) {
    var dv = new DataView(new ArrayBuffer(8));
    var num;
    if (size === 4) { dv.setUint32(0, Number(bits), false); num = dv.getFloat32(0, false); }
    else { dv.setBigUint64(0, bits, false); num = dv.getFloat64(0, false); }
    var hex = '0x' + bits.toString(16).toUpperCase().padStart(size * 2, '0');
    return floatLiteral(num, bits, size).replace(/^NaN$|^0x.*/, 'NaN') + ' · ' + hex;
  }

  function floatLiteral(num, bits, size) {
    if (isNaN(num)) { return '0x' + bits.toString(16).toUpperCase().padStart(size * 2, '0'); }
    if (Object.is(num, -0)) { return '-0.0'; }
    if (!isFinite(num)) { return num > 0 ? 'Infinity' : '-Infinity'; }
    if (size === 8) { return String(num); }
    for (var p = 1; p <= 9; p++) {
      var text = String(+num.toPrecision(p));
      if (Math.fround(+text) === num) { return text; }
    }
    return String(num);
  }

  function floatFromBits(bits, size) {
    var dv = new DataView(new ArrayBuffer(8));
    if (size === 4) { dv.setUint32(0, Number(bits), false); return dv.getFloat32(0, false); }
    dv.setBigUint64(0, bits, false);
    return dv.getFloat64(0, false);
  }

  function utf8(s, path) {
    for (var k = 0; k < s.length; k++) {
      var c = s.charCodeAt(k);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var d = s.charCodeAt(k + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { k++; continue; }
        throw WireError('Utf8', path + ': lone surrogate U+' + c.toString(16).toUpperCase() + ' cannot be valid UTF-8');
      }
      if (c >= 0xDC00 && c <= 0xDFFF) {
        throw WireError('Utf8', path + ': lone surrogate U+' + c.toString(16).toUpperCase() + ' cannot be valid UTF-8');
      }
    }
    return Array.from(new TextEncoder().encode(s));
  }

  function bytesValue(node, path) {
    if (node.t === 'str') {
      var hex = node.v.replace(/0x/gi, '').replace(/[\s,_:]/g, '');
      if (hex.length % 2 || /[^0-9a-f]/i.test(hex)) {
        throw WireError('Type', path + ': Bytes expects hex like "FF FE" or an array of 0-255');
      }
      var out = [];
      for (var k = 0; k < hex.length; k += 2) { out.push(parseInt(hex.slice(k, k + 2), 16)); }
      return out;
    }
    if (node.t === 'arr') {
      return node.items.map(function (item, idx) {
        var v = item.t === 'num' ? parseIntegerText(item.raw) : null;
        if (v === null || v < 0n || v > 255n) {
          throw WireError('Type', path + '[' + idx + ']: expected a byte 0-255');
        }
        return Number(v);
      });
    }
    throw WireError('Type', path + ': Bytes expects hex like "FF FE" or an array of 0-255');
  }

  function alignOf(type, schema) {
    if (type.k === 'prim') { return type.p.size; }
    if (type.k === 'enum') { return 4; }
    if (type.k === 'model') {
      return schema.models[type.name].fields.reduce(function (a, f) { return Math.max(a, alignOf(f.type, schema)); }, 1);
    }
    return 8;
  }

  function hexList(arr) {
    return arr.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16).toUpperCase(); }).join(' ');
  }

  function preview(s) {
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  function encodeNode(type, node, path, out, schema) {
    var opts = out.opts;
    switch (type.k) {
      case 'prim': {
        var p = type.p;
        if (type.name === 'bool') {
          if (node.t !== 'id' || !/^(true|false)$/.test(node.v)) {
            throw WireError('Type', path + ': bool expects true or false');
          }
          out.push([node.v === 'true' ? 1 : 0], { path: path, f: 'bool', type: 'bool', text: node.v });
          return;
        }
        if (p.float) {
          var fb = floatBits(node, p.size, path, opts);
          out.push(intBytes(fb.bits, p.size, opts.bigEndian), { path: path, f: 'float', type: type.name, text: fb.text });
          return;
        }
        var v = node.t === 'num' || node.t === 'str' ? parseIntegerText(node.t === 'num' ? node.raw : node.v) : null;
        if (v === null) { throw WireError('Type', path + ': ' + type.name + ' expects an integer'); }
        checkRange(v, p, path);
        out.push(intBytes(v, p.size, opts.bigEndian), { path: path, f: 'int', type: type.name, text: v.toString() });
        return;
      }
      case 'string': {
        if (node.t !== 'str') { throw WireError('Type', path + ': String expects a quoted string'); }
        var data = utf8(node.v, path);
        var count = opts.charLength ? Array.from(node.v).length : data.length;
        out.push(intBytes(BigInt(count), 4, opts.bigEndian), {
          path: path + '.length', f: 'len', type: 'u32', text: count + (opts.charLength ? ' characters' : ' bytes')
        });
        out.push(data, { path: path + '.utf8', f: 'str', type: 'UTF-8', text: '"' + preview(node.v) + '"' });
        return;
      }
      case 'bytes': {
        var raw = bytesValue(node, path);
        out.push(intBytes(BigInt(raw.length), 4, opts.bigEndian), { path: path + '.length', f: 'len', type: 'u32', text: raw.length + ' bytes' });
        out.push(raw, { path: path + '.data', f: 'str', type: 'raw', text: preview(hexList(raw)) });
        return;
      }
      case 'enum': {
        var en = schema.enums[type.name];
        var member = null;
        if (node.t === 'id' || node.t === 'str') {
          var nm = node.v.replace(new RegExp('^' + type.name + '(::|\\.)'), '');
          member = en.members.filter(function (m) { return m.name === nm; })[0];
          if (!member) { throw WireError('Enum', path + ': ' + type.name + ' has no member "' + nm + '"', { vector: 'N-040' }); }
        } else if (node.t === 'num') {
          var ev = parseIntegerText(node.raw);
          member = en.members.filter(function (m) { return m.value === ev; })[0];
          if (!member) { throw WireError('Enum', path + ': ' + node.raw + ' is not a defined ' + type.name + ' value', { vector: 'N-040' }); }
        } else {
          throw WireError('Type', path + ': enum expects a member name');
        }
        var esize = opts.enumByte ? 1 : 4;
        out.push(intBytes(member.value, esize, opts.bigEndian), {
          path: path, f: 'enum', type: type.name, text: type.name + '::' + member.name + ' = ' + member.value
        });
        return;
      }
      case 'array': {
        if (node.t !== 'arr') { throw WireError('Type', path + ': ' + typeName(type) + ' expects [ ... ]'); }
        var countSeg = { path: path + '.count', f: 'len', type: 'u32', text: node.items.length + ' elements' };
        var at = out.push([0, 0, 0, 0], countSeg);
        var before = out.bytes.length;
        node.items.forEach(function (item, idx) {
          encodeNode(type.of, item, path + '[' + idx + ']', out, schema);
        });
        var n = opts.arrayBytes ? out.bytes.length - before : node.items.length;
        if (opts.arrayBytes) { countSeg.text = n + ' bytes'; }
        var cb = intBytes(BigInt(n), 4, opts.bigEndian);
        for (var k = 0; k < 4; k++) { out.bytes[at + k] = cb[k]; }
        return;
      }
      case 'model': {
        var model = schema.models[type.name];
        var byName = {};
        if (node.t === 'obj') {
          node.entries.forEach(function (e) {
            if (!model.fields.some(function (f) { return f.name === e[0]; })) {
              throw WireError('Type', (path || type.name) + ': ' + type.name + ' has no field "' + e[0] + '"');
            }
            byName[e[0]] = e[1];
          });
        } else if (node.t === 'arr') {
          if (node.items.length !== model.fields.length) {
            throw WireError('Type', (path || type.name) + ': ' + type.name + ' has ' + model.fields.length + ' fields, got ' + node.items.length + ' values');
          }
          model.fields.forEach(function (f, idx) { byName[f.name] = node.items[idx]; });
        } else {
          throw WireError('Type', (path || type.name) + ': ' + type.name + ' expects { field: value, ... }');
        }
        var fields = model.fields.slice();
        if (opts.sortFields) {
          fields.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
        }
        if (opts.sizeReorder) {
          fields = fields.map(function (f, idx) { return { f: f, idx: idx }; })
            .sort(function (a, b) { return alignOf(b.f.type, schema) - alignOf(a.f.type, schema) || a.idx - b.idx; })
            .map(function (x) { return x.f; });
        }
        var base = out.bytes.length;
        var maxAlign = 1;
        fields.forEach(function (f) {
          if (!(f.name in byName)) {
            throw WireError('Type', (path || type.name) + ': missing field "' + f.name + '" (Fomoxa has no defaults)');
          }
          if (opts.memLayout) {
            var al = alignOf(f.type, schema);
            maxAlign = Math.max(maxAlign, al);
            var pad = (al - ((out.bytes.length - base) % al)) % al;
            if (pad) { out.push(new Array(pad).fill(0), { path: (path ? path + '.' : '') + '(padding)', f: 'pad', type: 'pad', text: pad + ' bytes of padding' }); }
          }
          encodeNode(f.type, byName[f.name], path ? path + '.' + f.name : f.name, out, schema);
        });
        if (opts.memLayout) {
          var tail = (maxAlign - ((out.bytes.length - base) % maxAlign)) % maxAlign;
          if (tail) { out.push(new Array(tail).fill(0), { path: (path ? path + '.' : '') + '(padding)', f: 'pad', type: 'pad', text: tail + ' bytes of padding' }); }
        }
        return;
      }
    }
  }

  function encode(schema, type, value, opts) {
    var out = new Out(opts);
    var node = typeof value === 'string' ? parseValue(value) : value;
    encodeNode(type, node, type.k === 'model' ? '' : 'value', out, schema);
    return { bytes: out.bytes, segs: out.segs };
  }

  function minSize(type, schema) {
    switch (type.k) {
      case 'prim': return type.p.size;
      case 'enum': return 4;
      case 'model':
        return schema.models[type.name].fields.reduce(function (a, f) { return a + minSize(f.type, schema); }, 0);
      default: return 4;
    }
  }

  function Reader(bytes) {
    this.b = bytes;
    this.pos = 0;
    this.segs = [];
  }
  Reader.prototype.take = function (n, path, what) {
    var remaining = this.b.length - this.pos;
    if (n > remaining) {
      throw WireError('UnexpectedEof', path + ': ' + what + ' needs ' + n + ' bytes, ' + remaining + ' remain', { at: this.pos, vector: 'N-010' });
    }
    var out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  };
  Reader.prototype.seg = function (start, path, f, type, text) {
    if (this.pos > start) {
      this.segs.push({ path: path, f: f, type: type, text: text, start: start, len: this.pos - start });
    }
  };

  function leInt(arr, signed) {
    var v = 0n;
    for (var k = arr.length - 1; k >= 0; k--) { v = (v << 8n) | BigInt(arr[k]); }
    return signed ? BigInt.asIntN(arr.length * 8, v) : v;
  }

  function quote(s) {
    return JSON.stringify(s);
  }

  function decodeNode(type, r, path, schema, strict) {
    var start = r.pos;
    switch (type.k) {
      case 'prim': {
        var p = type.p;
        var raw = r.take(p.size, path, type.name);
        if (type.name === 'bool') {
          if (raw[0] > 1) {
            r.pos = start;
            throw WireError('InvalidBool', path + ': bool byte is 0x' + hexList(raw) + ', only 00 or 01 are valid', { at: start, vector: 'N-001' });
          }
          r.seg(start, path, 'bool', 'bool', raw[0] ? 'true' : 'false');
          return raw[0] ? 'true' : 'false';
        }
        if (p.float) {
          var bits = leInt(raw, false);
          var text = formatFloat(bits, p.size);
          r.seg(start, path, 'float', type.name, text);
          return floatLiteral(floatFromBits(bits, p.size), bits, p.size);
        }
        var v = leInt(raw, p.signed);
        r.seg(start, path, 'int', type.name, v.toString());
        return v.toString();
      }
      case 'string':
      case 'bytes': {
        var len = Number(leInt(r.take(4, path + '.length', 'length prefix'), false));
        r.seg(start, path + '.length', 'len', 'u32', len + ' bytes');
        var remaining = r.b.length - r.pos;
        if (len > remaining) {
          throw WireError('UnexpectedEof', path + ': length says ' + len + ' bytes, only ' + remaining + ' remain - rejected before allocating', { at: start, vector: 'N-022 / N-023' });
        }
        var dataStart = r.pos;
        var data = r.take(len, path, 'data');
        if (type.k === 'bytes') {
          r.seg(dataStart, path + '.data', 'str', 'raw', preview(hexList(data)));
          return quote(hexList(data));
        }
        var s;
        try {
          s = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(data));
        } catch (e) {
          throw WireError('InvalidUtf8', path + ': string bytes are not valid UTF-8', { at: dataStart, vector: 'N-020 / N-021' });
        }
        r.seg(dataStart, path + '.utf8', 'str', 'UTF-8', quote(preview(s)));
        return quote(s);
      }
      case 'enum': {
        var ev = leInt(r.take(4, path, 'enum'), false);
        var en = schema.enums[type.name];
        var member = en.members.filter(function (m) { return m.value === ev; })[0];
        if (!member) {
          throw WireError('UndefinedEnum', path + ': ' + ev + ' is not a defined ' + type.name + ' value', { at: start, vector: 'N-040' });
        }
        r.seg(start, path, 'enum', type.name, type.name + '::' + member.name + ' = ' + ev);
        return member.name;
      }
      case 'array': {
        var count = Number(leInt(r.take(4, path + '.count', 'element count'), false));
        r.seg(start, path + '.count', 'len', 'u32', count + ' elements');
        var need = count * minSize(type.of, schema);
        var left = r.b.length - r.pos;
        if (need > left) {
          throw WireError('UnexpectedEof', path + ': count ' + count + ' needs at least ' + need + ' bytes, only ' + left + ' remain - rejected before allocating', { at: start, vector: 'N-030 / N-031' });
        }
        var items = [];
        for (var k = 0; k < count; k++) {
          items.push(decodeNode(type.of, r, path + '[' + k + ']', schema, true));
        }
        return '[' + items.join(', ') + ']';
      }
      case 'model': {
        var model = schema.models[type.name];
        var parts = [];
        var absent = false;
        model.fields.forEach(function (f) {
          var fp = path ? path + '.' + f.name : f.name;
          if (!absent && !strict && r.pos === r.b.length) { absent = true; }
          if (absent) {
            r.absent.push(fp);
            parts.push(f.name + ': ' + zeroValue(f.type, schema));
          } else {
            parts.push(f.name + ': ' + decodeNode(f.type, r, fp, schema, strict));
          }
        });
        return '{ ' + parts.join(', ') + ' }';
      }
    }
  }

  function zeroValue(type, schema) {
    switch (type.k) {
      case 'prim': return type.name === 'bool' ? 'false' : '0';
      case 'string': return '""';
      case 'bytes': return '""';
      case 'array': return '[]';
      case 'enum': {
        var m = schema.enums[type.name].members.filter(function (x) { return x.value === 0n; })[0];
        return m ? m.name : '0';
      }
      case 'model':
        return '{ ' + schema.models[type.name].fields.map(function (f) { return f.name + ': ' + zeroValue(f.type, schema); }).join(', ') + ' }';
    }
  }

  function decode(schema, type, bytes) {
    var r = new Reader(bytes);
    r.absent = [];
    var result = { segs: r.segs, absent: r.absent, trailing: 0, value: null, error: null };
    try {
      result.value = decodeNode(type, r, type.k === 'model' ? '' : 'value', schema, false);
      result.trailing = bytes.length - r.pos;
      result.consumed = r.pos;
    } catch (e) {
      if (!e.code) { throw e; }
      result.error = e;
      result.consumed = r.pos;
    }
    return result;
  }

  function parseHex(text) {
    var hex = String(text).replace(/0x/gi, '').replace(/[\s,_:\[\]]/g, '');
    if (hex.length % 2) { throw WireError('Hex', 'odd number of hex digits'); }
    if (/[^0-9a-f]/i.test(hex)) { throw WireError('Hex', 'not a hex string'); }
    var out = [];
    for (var k = 0; k < hex.length; k += 2) { out.push(parseInt(hex.slice(k, k + 2), 16)); }
    if (out.length > MAX_OUTPUT) { throw WireError('Limit', 'input larger than 1 MiB'); }
    return out;
  }

  var BUGS = [
    { id: 'bigEndian', vector: 'P-032' },
    { id: 'charLength', vector: 'S-004' },
    { id: 'memLayout', vector: 'T-010' },
    { id: 'sizeReorder', vector: 'T-010' },
    { id: 'sortFields', vector: 'T-011' },
    { id: 'arrayBytes', vector: 'A-002' },
    { id: 'enumByte', vector: 'E-010' },
    { id: 'nanCanon', vector: 'F-031' }
  ];

  var api = {
    parseSchema: parseSchema,
    parseType: parseType,
    parseValue: parseValue,
    typeName: typeName,
    encode: encode,
    decode: decode,
    parseHex: parseHex,
    hexList: hexList,
    BUGS: BUGS
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  global.FomoxaWire = api;
})(typeof window !== 'undefined' ? window : globalThis);
