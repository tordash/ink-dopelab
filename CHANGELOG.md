# Changelog

All notable changes to INK by DopeLab will be documented in this file.

## [0.6.0] - 2026-03-02

### Added
- **AI cover images** — 8 photorealistic cover images generated via Nano Banana 2 (Gemini), processed by Velite with blur placeholders
- **Cover image UI** — Article cards (featured + regular), article pages, and blog listing all display cover images with hover effects
- **SVG diagrams** — 3 professional diagrams: Agent Teams Architecture, Stock Management Flow, Blog Build Pipeline
- **Diagram references** — SVG diagrams embedded in 3 articles (TH+EN): agent-teams, stock-management, building-blog

### Changed
- `ArticleCard` component: accepts optional `CoverImage` prop, renders cover or falls back to category color blocks
- Article page: hero cover image displayed before title (full-width, rounded, max-height 400px)
- Blog listing + homepage: pass cover data to all article cards

### Infrastructure
- 3 parallel agents built Phase 5 (cover-ui, cover-gen, svg-diagrams)
- Gemini batch generation with state tracking and resume support

## [0.5.0] - 2026-03-02

### Added
- **Blotato auto-post** — `scripts/post-social.sh` posts articles to FB/IG via Blotato API with AI-generated captions
- **Social visual generator** — `scripts/create-social-visual.sh` creates carousel/quotes/video from articles via Blotato Visual API
- **Social config** — `scripts/social-config.json` with DopeLab.Studio account settings
- **Giscus comments** — GitHub Discussions-powered comments on every article, dark mode + locale-aware
- **@giscus/react** — New dependency for comments component

### Infrastructure
- GitHub Discussions enabled on tordash/ink-dopelab
- 4 parallel agents built Phase 4 (social-post, social-visual, vercel-deploy, giscus-comments)
- Vercel auto-deploy: requires manual GitHub App install (see README)

## [0.4.0] - 2026-03-02

### Added
- **About page** — `/[locale]/about` with 6 sections: hero, who we are (stat cards), AI team (6 agent cards), what is INK, tech stack (pill badges), CTA
- **Content scaffolding script** — `scripts/new-article.sh` scaffolds TH+EN article templates with frontmatter, category picker, validation
- **Auto-translate script** — `scripts/translate.sh` translates TH→EN via Claude API (curl + jq), with --dry-run and --force flags
- **Navigation** — About link added to desktop header and mobile nav
- **i18n** — 28 "about" translation keys (TH + EN)

### Infrastructure
- Agent Teams workflow: 3 parallel agents (about-page, content-cli, translate-cli) built Phase 3 concurrently

## [0.3.0] - 2026-03-02

### Added
- **Category pages** — `/[locale]/blog/category/[category]` with icon, color indicator, breadcrumb
- **Tag pages** — `/[locale]/blog/tag/[tag]` with #tag header, breadcrumb
- **Blog listing enhanced** — category filter pills, total post count, tag cloud section
- **Client-side search** — filters by title, description, category, tags with clear button
- **RSS feed** — `/feed.xml` (RSS 2.0, latest 20 posts TH+EN, atom:link)
- **Vercel Analytics** — `@vercel/analytics` integrated in root layout
- **Sitemap** — category routes (priority 0.7) + tag routes (priority 0.6)
- **Footer** — RSS link icon
- **Layout** — `<link rel="alternate" type="application/rss+xml">` in `<head>`
- Translation keys: categories, tags, search, post_count, no_results, search_placeholder

### Changed
- `CATEGORY_STYLES` exported from `article-card.tsx` for reuse across pages
- Blog page refactored: server page + `BlogContent` client wrapper for search state

## [0.2.0] - 2026-03-02

### Added
- **OG Image API** — Edge route, 1200x630, brand fonts, category color pill
- **JSON-LD** — per-article structured data with image fallback to OG URL
- **Brand fonts** — Special Elite (EN) + Charmonman (TH) for hero/logo
- **Article cards** — category color blocks (5 categories mapped)
- **Author byline** — DopeLab Studio avatar on article pages
- **Share buttons** — Facebook, X, Copy Link
- **AVIF/WebP** — optimized image formats

### Changed
- Typography hierarchy redesigned
- Footer "INK" logo uses typewriter font

## [0.1.0] - 2026-03-02

### Added
- Initial scaffold: Next.js 16 + Velite (MDX) + next-intl + Tailwind v4
- Bilingual routing (TH default + EN)
- 7 articles (TH + EN): remote dev, stock management, cost analysis, stock bot, client dashboard, agent teams, AI carousel
- Homepage with featured + latest sections
- Article page with TOC, reading time, related posts
- Dark/light theme support
- Sitemap, robots.txt
- Vercel deployment with custom domain (ink.dopelab.studio)
