# Session Changelog — ink.dopelab.studio Redesign

> **Date:** 2026-03-02
> **Started:** 2026-03-02 00:13 ICT
> **Completed:** 2026-03-02 09:57 ICT
> **Branch:** worktree-ink-redesign (in marketing-agency-team repo)
> **Author:** Claude (Session 70)
> **Status:** Ready for review + merge

---

## Summary

แก้ปัญหาหลัก: **Typography plugin ไม่ทำงาน** ทำให้ headings ในบทความไม่มี styling + ปรับ visual hierarchy ทั้ง homepage และ article pages

---

## Changes Made

### 1. `src/app/globals.css` — CRITICAL FIX + Major Enhancement

**Root cause fix:**
- เพิ่ม `@plugin "@tailwindcss/typography"` — Tailwind v4 ต้อง explicit import plugin ใน CSS (ต่างจาก v3 ที่ใช้ tailwind.config)
- **ก่อนแก้:** `prose` classes ไม่ทำงานเลย → headings ในบทความดูเหมือน text ธรรมดา
- **หลังแก้:** H2, H3, H4, tables, blockquotes, code blocks ทั้งหมดมี style ถูกต้อง

**Typography enhancements:**
- H2: เพิ่ม border-bottom, font-weight 800, letter-spacing -0.02em
- H3: เปลี่ยนสีเป็น primary color (navy/gold in dark mode)
- H4: uppercase, smaller font, เพิ่ม letter-spacing
- Tables: เพิ่ม background สำหรับ thead, ปรับ padding
- Blockquotes: เพิ่ม background color, border-radius
- Inline code: เพิ่ม background pill style
- Code blocks: เพิ่ม background-color override
- ลบ duplicate `html { scroll-behavior: smooth; }` rule

### 2. `src/app/[locale]/page.tsx` — Homepage Redesign

**ก่อน:** Headings เล็ก (text-lg), ไม่มี visual separation ระหว่าง sections
**หลัง:**
- Hero section: เพิ่ม gradient background + border, H1 เป็น `text-4xl sm:text-5xl lg:text-6xl font-extrabold`
- Section headings: เพิ่ม colored accent bar (|) + `text-2xl sm:text-3xl font-bold`
- "ดูทั้งหมด" button: เปลี่ยนจาก text link เป็น bordered button
- Sections มี border-t separator + padding ที่มากขึ้น
- เปลี่ยน Sparkles icon เป็น Pen icon ใน hero badge

### 3. `src/components/blog/article-card.tsx` — Card Redesign

**Featured cards:**
- Category badge: เปลี่ยนจาก transparent bg เป็น solid primary bg + white text
- Gradient accent bar: หนาขึ้น (h-1 → h-1.5)
- เพิ่ม footer border-t separator
- เพิ่ม hover shadow effect (shadow-xl + shadow-primary/5)
- Heading: เพิ่ม font-bold consistency

**Regular cards:**
- เพิ่ม hover shadow effect
- Heading: `font-semibold` → `font-bold`
- ปรับ padding (p-5 → p-5 sm:p-6)
- ใช้ flexbox layout ให้ cards สูงเท่ากัน (flex-1 on description)

### 4. `src/app/[locale]/blog/[slug]/page.tsx` — Article Page

- H1: `text-3xl sm:text-4xl` → `text-3xl sm:text-4xl lg:text-5xl font-extrabold`
- Category badge: เปลี่ยนเป็น solid bg (primary + white text)
- Description: เพิ่ม `sm:text-xl`
- Related articles heading: เพิ่ม accent bar + `text-2xl font-bold`
- ปรับ spacing (mb-10 → mb-12)

### 5. `src/app/[locale]/blog/page.tsx` — Blog Listing

- H1: `text-3xl font-bold` → `text-3xl sm:text-4xl font-extrabold tracking-tight`
- Description: เพิ่ม `sm:text-xl`
- Grid gap: 4 → 5
- Header margin: mb-10 → mb-12

---

## Files Changed (5 files)

| File | Type | Description |
|------|------|-------------|
| `src/app/globals.css` | Modified | Typography plugin fix + heading/table/code styles |
| `src/app/[locale]/page.tsx` | Rewritten | Homepage layout + heading hierarchy |
| `src/components/blog/article-card.tsx` | Rewritten | Card design + visual hierarchy |
| `src/app/[locale]/blog/[slug]/page.tsx` | Modified | Article page H1 + related section |
| `src/app/[locale]/blog/page.tsx` | Modified | Blog listing H1 + spacing |

---

## Build Status

- `npm run build` — SUCCESS (22 static pages generated, 0 errors)

---

## How to Verify

1. `cd /Users/torsupakit/Projects/ink-dopelab && npm run dev`
2. Open `http://localhost:3000/th/` — check homepage headings
3. Click any article — check H2/H3 headings in article body
4. Toggle dark mode — check colors are consistent
5. Check mobile responsive

---

## What Was NOT Changed

- Content (MDX files) — ไม่แตะ
- Header/Footer components — ไม่แตะ
- i18n/routing — ไม่แตะ
- SEO (sitemap, robots, metadata) — ไม่แตะ
- Velite config — ไม่แตะ
- Dependencies — ไม่เพิ่ม/ลบ packages
