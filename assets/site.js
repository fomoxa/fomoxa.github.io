(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themeBtn');

  function updateThemeUI(theme) {
    if (!btn) return;
    var isDark = theme === 'dark';
    var isVi = root.getAttribute('lang') === 'vi';
    btn.setAttribute('aria-label', isDark ? (isVi ? 'Bấm để đổi sang giao diện sáng' : 'Switch to light theme') : (isVi ? 'Bấm để đổi sang giao diện tối' : 'Switch to dark theme'));
    btn.setAttribute('title', isDark ? (isVi ? 'Bấm để đổi sang giao diện sáng' : 'Switch to light theme') : (isVi ? 'Bấm để đổi sang giao diện tối' : 'Switch to dark theme'));
    var text = isDark ? (isVi ? 'Tối' : 'Dark') : (isVi ? 'Sáng' : 'Light');
    btn.innerHTML = (isDark ?
      '<svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>' :
      '<svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
    ) + '<span>' + text + '</span>';
  }

  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem('fomoxa_theme');
  } catch (e) {}

  var currentTheme = savedTheme || root.getAttribute('data-theme');
  if (!currentTheme) {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    currentTheme = prefersDark ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', currentTheme);
  try {
    localStorage.setItem('fomoxa_theme', currentTheme);
  } catch (e) {}
  updateThemeUI(currentTheme);

  // Enable transitions smoothly only after first frame render
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (document.body) {
        document.body.classList.add('theme-ready');
      }
    });
  });

  if (btn) {
    btn.addEventListener('click', function () {
      var active = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = active === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('fomoxa_theme', next);
      } catch (e) {}
      updateThemeUI(next);
    });
  }

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!localStorage.getItem('fomoxa_theme')) {
        var next = e.matches ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        updateThemeUI(next);
      }
    });
  } catch (err) {}

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
