import argparse
import pathlib
import sys

BUILD = pathlib.Path(__file__).resolve().parent
SITE = BUILD.parent
FRAG = BUILD / 'pages'
ORIGIN = 'https://fomoxa.github.io'

NAV = [
    ('', {'en': 'Protocol', 'vi': 'Protocol'}),
    ('why', {'en': 'Why', 'vi': 'Vì sao'}),
    ('getting-started', {'en': 'Get started', 'vi': 'Bắt đầu'}),
    ('inspector', {'en': 'Inspector', 'vi': 'Inspector'}),
    ('ecosystem', {'en': 'Ecosystem', 'vi': 'Hệ sinh thái'}),
    ('comparison', {'en': 'Compare', 'vi': 'So sánh'}),
    ('use-cases', {'en': 'Use cases', 'vi': 'Ứng dụng'}),
    ('roadmap', {'en': 'Roadmap', 'vi': 'Lộ trình'}),
]

PAGES = {
    'why': {
        'en': ('Why Fomoxa', 'Why a wire format with no encoder choices, where identical bytes matter, and what the annotation workflow saves and costs compared with an IDL.'),
        'vi': ('Vì sao Fomoxa', 'Vì sao cần một wire format không để encoder lựa chọn, khi nào byte giống hệt nhau là quan trọng, và cách dùng annotation được gì, mất gì so với IDL.'),
    },
    'getting-started': {
        'en': ('Getting started', 'Install fomoxac, annotate your first model, generate a codec and put 13 bytes on the wire in Rust, C#, Go or TypeScript.'),
        'vi': ('Bắt đầu', 'Cài fomoxac, đánh dấu model đầu tiên, sinh codec và ghi 13 byte ra wire bằng Rust, C#, Go hoặc TypeScript.'),
    },
    'inspector': {
        'en': ('Byte inspector', 'Type a value, see the exact Fomoxa bytes. Decode a payload, or compare against common implementation bugs and your own output.'),
        'vi': ('Byte inspector', 'Nhập giá trị, xem đúng các byte Fomoxa. Decode một payload, hoặc so sánh với các lỗi implementation hay gặp và output của chính bạn.'),
    },
    'ecosystem': {
        'en': ('Ecosystem', 'The Fomoxa specification, the fomoxac generator, and the sample runtime implementations for Rust, C#, Go, GDScript, C, C++, TypeScript and JavaScript.'),
        'vi': ('Hệ sinh thái', 'Specification của Fomoxa, công cụ sinh code fomoxac, và các runtime implementation mẫu cho Rust, C#, Go, GDScript, C, C++, TypeScript và JavaScript.'),
    },
    'comparison': {
        'en': ('Comparison', 'How Fomoxa differs from Protocol Buffers, FlatBuffers, Cap’n Proto, Borsh, BCS, JSON and MessagePack, with measured numbers. Differences, not rankings.'),
        'vi': ('So sánh', 'Fomoxa khác Protocol Buffers, FlatBuffers, Cap’n Proto, Borsh, BCS, JSON và MessagePack ở đâu, kèm số liệu đo thật. Chỉ nói khác nhau, không xếp hạng.'),
    },
    'use-cases': {
        'en': ('Use cases', 'Where a deterministic binary wire format fits: multiplayer games, backend services, embedded systems and cross-engine tooling.'),
        'vi': ('Ứng dụng', 'Một binary wire format xác định phù hợp ở đâu: game multiplayer, backend service, hệ nhúng và công cụ đa engine.'),
    },
    'roadmap': {
        'en': ('Roadmap', 'What is done, what comes next, and the estimated timeline for Fomoxa’s Unity and Unreal Engine work.'),
        'vi': ('Lộ trình', 'Những gì đã xong, những gì sẽ làm, và mốc thời gian ước lượng cho Unity và Unreal Engine.'),
    },
}

THEME = """<script>
(function(){try{var t=localStorage.getItem('fomoxa_theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>"""


def path_for(lang, slug):
    prefix = '/vi/' if lang == 'vi' else '/'
    return prefix + (slug + '/' if slug else '')


def render(lang, slug, body, scripts):
    title, desc = PAGES[slug][lang]
    other = 'vi' if lang == 'en' else 'en'
    nav = '\n'.join(
        '      <a href="%s"%s>%s</a>' % (path_for(lang, s), ' aria-current="page"' if s == slug else '', labels[lang])
        for s, labels in NAV
    )
    if lang == 'en':
        switch = '<span aria-current="true">EN</span><span class="sep">/</span><a href="%s" hreflang="vi" lang="vi">VI</a>' % path_for('vi', slug)
        nav_label, lang_label, theme_label = 'Site', 'Language', 'Toggle theme'
        foot_author = 'Created by <strong>Ha Duy Thang</strong>'
        foot_license = 'Licensed under'
    else:
        switch = '<a href="%s" hreflang="en" lang="en">EN</a><span class="sep">/</span><span aria-current="true">VI</span>' % path_for('en', slug)
        nav_label, lang_label, theme_label = 'Trang', 'Ngôn ngữ', 'Chuyển giao diện'
        foot_author = 'Tác giả <strong>Hà Duy Thắng</strong>'
        foot_license = 'Cấp phép theo'
    script_tags = '\n'.join('<script src="%s"></script>' % s for s in scripts)
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
{THEME}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - Fomoxa Protocol</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{ORIGIN}{path_for(lang, slug)}">
<link rel="alternate" hreflang="en" href="{ORIGIN}{path_for('en', slug)}">
<link rel="alternate" hreflang="vi" href="{ORIGIN}{path_for('vi', slug)}">
<link rel="alternate" hreflang="x-default" href="{ORIGIN}{path_for('en', slug)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
</head>
<body>

<header class="topbar">
  <div class="topbar-in">
    <a class="brand" href="{path_for(lang, '')}">
      <img src="/assets/logo.svg" alt="" class="brand-logo" />
      Fomoxa
    </a>
    <nav class="topnav" aria-label="{nav_label}">
{nav}
      <a href="https://github.com/fomoxa">GitHub ↗</a>
    </nav>
    <div class="topbar-actions">
      <p class="lang-switch" aria-label="{lang_label}">
        {switch}
      </p>
      <button class="theme-btn" id="themeBtn" type="button" aria-label="{theme_label}">Theme</button>
    </div>
  </div>
</header>

{body.strip()}

<footer>
  <div class="foot-in">
    <span class="foot-brand">Fomoxa Protocol</span>
    <span>{foot_author}</span>
  </div>
  <p class="foot-copy">
    Specification v1.1.0 · Final · Copyright © 2026 Ha Duy Thang ·
    {foot_license} <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
  </p>
</footer>

<script src="/assets/site.js"></script>
{script_tags}

</body>
</html>
"""


def sitemap():
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for slug, _ in NAV:
        for lang in ('en', 'vi'):
            lines.append('  <url>')
            lines.append(f'    <loc>{ORIGIN}{path_for(lang, slug)}</loc>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="en" href="{ORIGIN}{path_for("en", slug)}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="vi" href="{ORIGIN}{path_for("vi", slug)}"/>')
            lines.append('  </url>')
    lines.append('</urlset>')
    return '\n'.join(lines) + '\n'


def outputs():
    for slug in PAGES:
        for lang in ('en', 'vi'):
            frag = FRAG / lang / f'{slug}.html'
            if not frag.exists():
                sys.exit(f'missing fragment: {frag.relative_to(SITE)}')
            scripts = ['/assets/inspector.js', '/assets/inspector-ui.js'] if slug == 'inspector' else []
            target = SITE / ('vi' if lang == 'vi' else '') / slug / 'index.html'
            yield target, render(lang, slug, frag.read_text(encoding='utf-8'), scripts)
    yield SITE / 'sitemap.xml', sitemap()


def main():
    parser = argparse.ArgumentParser(description='Build the generated pages of fomoxa.github.io.')
    parser.add_argument('--check', action='store_true', help='write nothing; exit 1 if any generated file is stale')
    args = parser.parse_args()
    stale = []
    for target, content in outputs():
        current = target.read_text(encoding='utf-8') if target.exists() else None
        if current == content:
            continue
        rel = target.relative_to(SITE)
        if args.check:
            stale.append(str(rel))
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        print('wrote', rel)
    if stale:
        print('stale:', *stale, sep='\n  ')
        sys.exit(1)


if __name__ == '__main__':
    main()
