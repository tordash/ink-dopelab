#!/usr/bin/env python3
"""Generate professional SVG illustrations for INK blog posts.
Replaces all /images/placeholder.jpg references with real SVGs.
"""

import re
import os
import hashlib
import json

CONTENT_DIR = "content/posts/th"
PUBLIC_DIR = "public/static"

# DopeLab brand colors
COLORS = {
    "gold": "#FFCC00",
    "black": "#0a0a0a",
    "dark": "#1a1a2e",
    "green": "#27AE60",
    "orange": "#FF6B35",
    "red": "#e74c3c",
    "purple": "#9b59b6",
    "blue": "#3498db",
    "navy": "#2B4C7E",
    "cream": "#F7F5F0",
    "gray": "#888888",
    "darkgray": "#333333",
}

# Keywords -> visual theme mapping
THEMES = {
    "pipeline": {"icon": "&#x2699;&#xFE0F;", "accent": COLORS["gold"], "style": "flow"},
    "dashboard": {"icon": "&#x1F4CA;", "accent": COLORS["blue"], "style": "grid"},
    "calendar": {"icon": "&#x1F4C5;", "accent": COLORS["green"], "style": "grid"},
    "cost": {"icon": "&#x1F4B0;", "accent": COLORS["orange"], "style": "chart"},
    "breakdown": {"icon": "&#x1F4CA;", "accent": COLORS["orange"], "style": "chart"},
    "comparison": {"icon": "&#x2696;&#xFE0F;", "accent": COLORS["blue"], "style": "compare"},
    "architecture": {"icon": "&#x1F3D7;&#xFE0F;", "accent": COLORS["purple"], "style": "flow"},
    "diagram": {"icon": "&#x1F4D0;", "accent": COLORS["gold"], "style": "flow"},
    "security": {"icon": "&#x1F6E1;&#xFE0F;", "accent": COLORS["red"], "style": "shield"},
    "funding": {"icon": "&#x1F4B5;", "accent": COLORS["green"], "style": "chart"},
    "investor": {"icon": "&#x1F465;", "accent": COLORS["navy"], "style": "grid"},
    "robot": {"icon": "&#x1F916;", "accent": COLORS["purple"], "style": "center"},
    "lesson": {"icon": "&#x1F4A1;", "accent": COLORS["gold"], "style": "list"},
    "checklist": {"icon": "&#x2705;", "accent": COLORS["green"], "style": "list"},
    "strategy": {"icon": "&#x1F3AF;", "accent": COLORS["navy"], "style": "list"},
    "search": {"icon": "&#x1F50D;", "accent": COLORS["blue"], "style": "flow"},
    "token": {"icon": "&#x1F3AB;", "accent": COLORS["gold"], "style": "chart"},
    "metric": {"icon": "&#x1F4C8;", "accent": COLORS["green"], "style": "chart"},
    "warning": {"icon": "&#x26A0;&#xFE0F;", "accent": COLORS["orange"], "style": "list"},
    "step": {"icon": "&#x1F463;", "accent": COLORS["blue"], "style": "flow"},
    "content": {"icon": "&#x1F4DD;", "accent": COLORS["gold"], "style": "grid"},
    "ai": {"icon": "&#x1F916;", "accent": COLORS["purple"], "style": "center"},
    "production": {"icon": "&#x1F3AC;", "accent": COLORS["gold"], "style": "flow"},
    "keynote": {"icon": "&#x1F3A4;", "accent": COLORS["navy"], "style": "center"},
    "community": {"icon": "&#x1F310;", "accent": COLORS["blue"], "style": "grid"},
    "loop": {"icon": "&#x1F504;", "accent": COLORS["purple"], "style": "flow"},
    "memory": {"icon": "&#x1F9E0;", "accent": COLORS["purple"], "style": "flow"},
    "pricing": {"icon": "&#x1F4B2;", "accent": COLORS["green"], "style": "compare"},
    "open source": {"icon": "&#x1F513;", "accent": COLORS["green"], "style": "compare"},
    "ipo": {"icon": "&#x1F4C8;", "accent": COLORS["navy"], "style": "chart"},
    "business": {"icon": "&#x1F3E2;", "accent": COLORS["navy"], "style": "grid"},
    "roi": {"icon": "&#x1F4B0;", "accent": COLORS["green"], "style": "chart"},
    "forecast": {"icon": "&#x1F4C8;", "accent": COLORS["blue"], "style": "chart"},
    "staff": {"icon": "&#x1F465;", "accent": COLORS["navy"], "style": "grid"},
    "tracker": {"icon": "&#x1F4CB;", "accent": COLORS["green"], "style": "grid"},
    "insight": {"icon": "&#x1F4A1;", "accent": COLORS["gold"], "style": "list"},
    "chaos": {"icon": "&#x1F300;", "accent": COLORS["red"], "style": "center"},
    "pillar": {"icon": "&#x1F3DB;&#xFE0F;", "accent": COLORS["gold"], "style": "grid"},
    "bill": {"icon": "&#x1F9FE;", "accent": COLORS["orange"], "style": "compare"},
    "plan": {"icon": "&#x1F4CB;", "accent": COLORS["blue"], "style": "list"},
    "default": {"icon": "&#x2728;", "accent": COLORS["gold"], "style": "center"},
}


def detect_theme(alt_text: str) -> dict:
    """Detect visual theme from alt text keywords."""
    alt_lower = alt_text.lower()
    for keyword, theme in THEMES.items():
        if keyword in alt_lower:
            return theme
    return THEMES["default"]


def generate_svg(alt_text: str, slug: str, index: int) -> str:
    """Generate a professional SVG based on alt text context."""
    theme = detect_theme(alt_text)
    accent = theme["accent"]
    icon = theme["icon"]
    style = theme["style"]

    # Split alt text into title lines (max 2 lines, ~30 chars each)
    words = alt_text.split(" — ")
    if len(words) >= 2:
        title = words[0][:40]
        subtitle = words[1][:60]
    else:
        parts = alt_text.split()
        mid = len(parts) // 2
        title = " ".join(parts[:mid])[:40]
        subtitle = " ".join(parts[mid:])[:60]

    # Unique seed for visual variety
    seed = int(hashlib.md5(alt_text.encode()).hexdigest()[:8], 16)

    # Generate decorative elements based on style
    decorations = ""

    if style == "flow":
        # Flow arrows/nodes
        positions = [(180, 340), (400, 340), (620, 340), (840, 340)]
        labels = ["Input", "Process", "Transform", "Output"]
        for i, (x, y) in enumerate(positions):
            decorations += f'''
            <rect x="{x}" y="{y}" width="140" height="60" rx="10" fill="#1e1e3a" stroke="{accent}" stroke-width="1.5" opacity="0.9"/>
            <text x="{x+70}" y="{y+35}" text-anchor="middle" fill="{accent}" font-size="14" font-weight="600">{labels[i]}</text>'''
            if i < len(positions) - 1:
                nx = positions[i+1][0]
                decorations += f'''
            <line x1="{x+140}" y1="{y+30}" x2="{nx}" y2="{y+30}" stroke="{accent}" stroke-width="1.5" opacity="0.5"/>
            <polygon points="{nx-2},{y+25} {nx+6},{y+30} {nx-2},{y+35}" fill="{accent}" opacity="0.5"/>'''

    elif style == "chart":
        # Bar chart
        bar_heights = [(seed >> i) % 120 + 40 for i in range(6)]
        max_h = max(bar_heights)
        for i, h in enumerate(bar_heights):
            x = 200 + i * 130
            y = 430 - h
            opacity = 0.5 + (h / max_h) * 0.5
            decorations += f'''
            <rect x="{x}" y="{y}" width="80" height="{h}" rx="6" fill="{accent}" opacity="{opacity:.1f}"/>'''
        decorations += f'''
        <line x1="180" y1="430" x2="1000" y2="430" stroke="#444" stroke-width="1"/>'''

    elif style == "grid":
        # Grid of cards
        for row in range(2):
            for col in range(3):
                x = 180 + col * 280
                y = 300 + row * 90
                decorations += f'''
            <rect x="{x}" y="{y}" width="240" height="70" rx="10" fill="#1e1e3a" stroke="#333" stroke-width="1"/>
            <rect x="{x+10}" y="{y+15}" width="40" height="40" rx="8" fill="{accent}" opacity="0.2"/>
            <rect x="{x+65}" y="{y+20}" width="150" height="10" rx="4" fill="#444"/>
            <rect x="{x+65}" y="{y+38}" width="100" height="8" rx="4" fill="#333"/>'''

    elif style == "list":
        # Checklist items
        items = alt_text.split(" — ")[-1].split(",") if "," in alt_text else ["Point 1", "Point 2", "Point 3", "Point 4"]
        for i in range(min(5, max(3, len(items)))):
            y = 310 + i * 50
            decorations += f'''
            <rect x="250" y="{y}" width="700" height="38" rx="8" fill="#1e1e3a" stroke="#333" stroke-width="1"/>
            <circle cx="280" cy="{y+19}" r="10" fill="{accent}" opacity="0.3"/>
            <text x="280" y="{y+24}" text-anchor="middle" fill="{accent}" font-size="12">&#x2714;</text>
            <rect x="305" y="{y+13}" width="{200 + (seed >> i) % 300}" height="10" rx="4" fill="#444"/>'''

    elif style == "compare":
        # Side by side comparison
        decorations += f'''
            <rect x="120" y="300" width="420" height="200" rx="14" fill="#1e1e3a" stroke="{accent}" stroke-width="1.5"/>
            <text x="330" y="335" text-anchor="middle" fill="{accent}" font-size="16" font-weight="600">Option A</text>
            <rect x="660" y="300" width="420" height="200" rx="14" fill="#1e1e3a" stroke="#666" stroke-width="1.5"/>
            <text x="870" y="335" text-anchor="middle" fill="#888" font-size="16" font-weight="600">Option B</text>
            <text x="600" y="410" text-anchor="middle" fill="#555" font-size="24">vs</text>'''
        for i in range(3):
            y = 360 + i * 40
            decorations += f'''
            <rect x="150" y="{y}" width="360" height="10" rx="4" fill="{accent}" opacity="{0.3 + i*0.2}"/>
            <rect x="690" y="{y}" width="360" height="10" rx="4" fill="#555" opacity="{0.3 + i*0.15}"/>'''

    elif style == "shield":
        # Security/shield visual
        decorations += f'''
            <path d="M600,280 L680,310 L680,400 C680,440 640,470 600,490 C560,470 520,440 520,400 L520,310 Z"
                  fill="none" stroke="{accent}" stroke-width="2.5"/>
            <path d="M600,300 L660,322 L660,395 C660,425 635,450 600,465 C565,450 540,425 540,395 L540,322 Z"
                  fill="{accent}" opacity="0.1"/>
            <text x="600" y="400" text-anchor="middle" fill="{accent}" font-size="40">{icon}</text>'''

    else:  # center
        # Centered icon with decorative rings
        decorations += f'''
            <circle cx="600" cy="380" r="80" fill="none" stroke="{accent}" stroke-width="1.5" opacity="0.3"/>
            <circle cx="600" cy="380" r="55" fill="none" stroke="{accent}" stroke-width="1" opacity="0.5"/>
            <circle cx="600" cy="380" r="35" fill="{accent}" opacity="0.1"/>
            <text x="600" y="395" text-anchor="middle" fill="{accent}" font-size="36">{icon}</text>'''

    # Network decoration (subtle, top-right)
    net_nodes = ""
    for i in range(5):
        nx = 900 + (seed >> (i*3)) % 200
        ny = 80 + (seed >> (i*3+1)) % 100
        net_nodes += f'<circle cx="{nx}" cy="{ny}" r="3" fill="{accent}" opacity="0.15"/>'
        if i > 0:
            px = 900 + (seed >> ((i-1)*3)) % 200
            py = 80 + (seed >> ((i-1)*3+1)) % 100
            net_nodes += f'<line x1="{px}" y1="{py}" x2="{nx}" y2="{ny}" stroke="{accent}" stroke-width="0.5" opacity="0.1"/>'

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" font-family="'Kanit', 'Inter', sans-serif">
  <defs>
    <linearGradient id="bg-{index}" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg-{index})"/>

  <!-- Network decoration -->
  {net_nodes}

  <!-- Category badge -->
  <rect x="50" y="50" width="10" height="50" rx="5" fill="{accent}"/>

  <!-- Title -->
  <text x="80" y="80" fill="#ffffff" font-size="26" font-weight="700">{title}</text>
  <text x="80" y="115" fill="#aaaaaa" font-size="16">{subtitle}</text>

  <!-- Divider -->
  <line x1="80" y1="140" x2="400" y2="140" stroke="{accent}" stroke-width="2" opacity="0.5"/>

  <!-- Main visual -->
  {decorations}

  <!-- Footer -->
  <line x1="80" y1="590" x2="1120" y2="590" stroke="#222" stroke-width="0.5"/>
  <text x="600" y="615" text-anchor="middle" fill="#444" font-size="11">DopeLab.Studio — ink.dopelab.studio</text>
</svg>'''
    return svg


def process_all_posts():
    """Scan all MDX files, generate SVGs, update paths."""
    results = {"generated": 0, "updated_posts": 0, "errors": []}

    for mdx_file in sorted(os.listdir(CONTENT_DIR)):
        if not mdx_file.endswith(".mdx"):
            continue

        mdx_path = os.path.join(CONTENT_DIR, mdx_file)
        slug = mdx_file.replace(".mdx", "")

        with open(mdx_path, "r") as f:
            content = f.read()

        # Find all placeholder images
        pattern = r'!\[(.*?)\]\(/images/placeholder\.jpg\)'
        matches = list(re.finditer(pattern, content))

        if not matches:
            continue

        print(f"\n{'='*60}")
        print(f"  {slug} — {len(matches)} images to generate")
        print(f"{'='*60}")

        # Create output directory
        svg_dir = os.path.join(PUBLIC_DIR, slug)
        os.makedirs(svg_dir, exist_ok=True)

        modified_content = content
        for i, match in enumerate(matches):
            alt_text = match.group(1)
            svg_name = f"img-{i+1}.svg"
            svg_path = os.path.join(svg_dir, svg_name)
            web_path = f"/static/{slug}/{svg_name}"

            # Generate SVG
            svg_content = generate_svg(alt_text, slug, results["generated"])
            with open(svg_path, "w") as f:
                f.write(svg_content)

            # Replace in content
            old = f"![{alt_text}](/images/placeholder.jpg)"
            new = f"![{alt_text}]({web_path})"
            modified_content = modified_content.replace(old, new, 1)

            results["generated"] += 1
            print(f"  ✓ [{i+1}] {svg_name} — {alt_text[:50]}...")

        # Also fix /images/blog/ references (missing files)
        blog_pattern = r'!\[(.*?)\]\(/images/blog/(.*?)\)'
        blog_matches = list(re.finditer(blog_pattern, modified_content))
        for i, match in enumerate(blog_matches):
            alt_text = match.group(1)
            old_filename = match.group(2)
            svg_name = f"img-hero.svg"
            svg_path = os.path.join(svg_dir, svg_name)
            web_path = f"/static/{slug}/{svg_name}"

            if not os.path.exists(os.path.join("public/images/blog", old_filename)):
                svg_content = generate_svg(alt_text, slug, results["generated"])
                with open(svg_path, "w") as f:
                    f.write(svg_content)

                old = f"![{alt_text}](/images/blog/{old_filename})"
                new = f"![{alt_text}]({web_path})"
                modified_content = modified_content.replace(old, new, 1)
                results["generated"] += 1
                print(f"  ✓ [hero] {svg_name} — {alt_text[:50]}...")

        # Write updated MDX
        with open(mdx_path, "w") as f:
            f.write(modified_content)

        results["updated_posts"] += 1

    return results


if __name__ == "__main__":
    print("=" * 60)
    print("  INK Blog — SVG Image Generator")
    print("  Replacing all placeholder images with real SVGs")
    print("=" * 60)

    results = process_all_posts()

    print(f"\n{'='*60}")
    print(f"  DONE")
    print(f"  Generated: {results['generated']} SVGs")
    print(f"  Updated:   {results['updated_posts']} posts")
    print(f"{'='*60}")
