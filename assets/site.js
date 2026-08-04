(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var current = root.getAttribute('data-theme') || (prefersDark ? 'dark' : 'light');
      root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    });
  }

  var mapRows = document.getElementById('mapRows');
  var status = document.getElementById('mapStatus');
  if (!mapRows || !status) { return; }

  var cells = Array.prototype.slice.call(mapRows.querySelectorAll('.cell'));
  var fields = Array.prototype.slice.call(document.querySelectorAll('#fields .field'));
  /* Shared by every language edition: the idle text comes from the page itself. */
  var idle = status.textContent;

  function clear() {
    cells.forEach(function (c) { c.classList.remove('dim', 'hot'); });
    fields.forEach(function (f) { f.classList.remove('active'); });
    status.textContent = idle;
  }

  function focusField(field) {
    var parts = field.getAttribute('data-range').split(',');
    var start = parseInt(parts[0], 10);
    var len = parseInt(parts[1], 10);
    cells.forEach(function (c) {
      var i = parseInt(c.getAttribute('data-i'), 10);
      var inRange = i >= start && i < start + len;
      c.classList.toggle('hot', inRange);
      c.classList.toggle('dim', !inRange);
    });
    fields.forEach(function (f) { f.classList.toggle('active', f === field); });
    var name = field.querySelector('.fn').childNodes[0].textContent.trim();
    var hex = start.toString(16).toUpperCase();
    if (hex.length < 2) { hex = '0' + hex; }
    status.textContent = '0x' + hex + ' · ' + len + ' B · ' + name;
  }

  fields.forEach(function (field) {
    field.addEventListener('mouseenter', function () { focusField(field); });
    field.addEventListener('focus', function () { focusField(field); });
    field.addEventListener('mouseleave', clear);
    field.addEventListener('blur', clear);
    field.addEventListener('click', function () { focusField(field); });
  });

  cells.forEach(function (cell) {
    cell.addEventListener('mouseenter', function () {
      var i = parseInt(cell.getAttribute('data-i'), 10);
      var owner = fields.filter(function (f) {
        var p = f.getAttribute('data-range').split(',');
        var s = parseInt(p[0], 10), l = parseInt(p[1], 10);
        return i >= s && i < s + l;
      })[0];
      if (owner) { focusField(owner); }
    });
  });

  mapRows.addEventListener('mouseleave', clear);
})();
