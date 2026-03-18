# Tokenomics.net Image Style Guide

## Brand Direction: "Precision Infrastructure"

Modern Web3 sophistication meets premium SaaS aesthetic. Isometric tokenized market forms rendered in frosted translucent glass with polished metallic gold filigree framework. Dramatic moody lighting, reflective dark floors, atmospheric fog. Peter Tarka-style cohesive miniature worlds with museum display composition. Museum-quality render, architectural precision, private bank annual report aesthetic.

**Reference**: See `uploads/APPROVED_PROMPTS.md` for full approved prompt library.

## Brand Colors

- **Charcoal**: #1A1714 (backgrounds, primary dark)
- **Cream**: #FAF8F5 (geometric structures, light text)
- **Gold**: #B8956E (metallic trim, accent highlights, connections)
- **Dark Gold**: #96734E (secondary accent)
- **Light Gold**: #D4B896 (tertiary accent)

## Brand Fonts

- **Serif (Headlines)**: Libre Baskerville — used for post titles on OG images
- **Sans-Serif (Body)**: Libre Franklin — used for subtitles and labels on OG images
- Font files are stored in `brand/fonts/`

## Brand Logos

- SVG logos stored in `uploads/logos/`
- `tokenomics-logo-light.svg` — for dark backgrounds (cream text, gold dot)
- `tokenomics-logo-dark.svg` — for light backgrounds
- `tokenomics-logo-combined.svg` — full icon + wordmark

---

## Image Rules (Mandatory)

1. **NO crypto logos** — No Bitcoin, Ethereum, or any blockchain symbols
2. **NO people** — Keep it abstract/architectural
3. **NO text IN AI-GENERATED IMAGES** — Hero images use AI (Gemini) and must NEVER contain text. Every AI prompt MUST include "No text, no words, no labels, no letters, no numbers, no captions" explicitly. Diagrams use Mermaid (not AI) so text is handled perfectly. OG text uses Sharp compositing.
4. **NO religious symbols** — Regional flavor through architecture/landscape only
5. **Thin gold circuit traces** = approved visual metaphor for connection (etched into dark floor, NOT thick pipes)
6. **Metallic gold** should have refined sheen, not flat color — light catching on edges
7. **Charcoal backgrounds** for compositable assets; edge-to-edge environments for heroes
8. **Isometric perspective** — all hero/feature images use isometric viewpoint
9. **Frosted translucent glass + gold filigree** — the signature visual element (glass dominant, cream as accent only)
10. **Reflective dark floor** — polished surface with subtle mirror reflections beneath objects
11. **Dramatic moody lighting** — volumetric golden hour rim light from upper right, objects emerging from darkness
12. **Atmospheric fog** — subtle mist at base of forms creating depth
13. **Museum display composition** — 3-4 key objects max, generous negative space, jewel-like presentation

---

## Image Types

### 1. Hero Images (Blog Post Header)

**Purpose**: Main visual for each blog post. Appears at top of post page. Also serves as base layer for OG images.

**Specs**:
- Generated via Gemini (Nano Banana Pro / gemini-3-pro-image-preview)
- Resolution: 4K base asset
- Aspect ratio: 16:9
- Optimized variants: 1200w JPG + WebP

**Base Prompt Structure** (v2 — glass+gold+moody, matching site headers):
```
Isometric precision infrastructure visualization, 16:9 cinematic composition. [SCENE-SPECIFIC DESCRIPTION]. Primary materials: frosted translucent glass forms with polished metallic gold (#B8956E) filigree framework, gold circuit trace detailing, and warm cream (#FAF8F5) accent panels. Glass should be the dominant material — semi-transparent with soft internal glow. Gold elements have refined metallic sheen with light catching on edges. Thin gold circuit trace lines etched into the dark floor connecting forms — delicate, not thick pipes. Floating minimal frosted glass data cards with abstract chart shapes. Deep warm charcoal (#1A1714) background filling entire scene. Polished dark reflective floor surface with subtle mirror reflections beneath objects. Subtle atmospheric fog at base of forms creating depth. Dramatic volumetric lighting with golden hour rim light from upper right, objects emerging from darkness. Centered composition with generous negative space and balanced visual weight — fewer objects, museum display presentation. Premium institutional aesthetic, Peter Tarka style small cohesive world. No text, no words, no labels, no letters, no numbers, no captions, no people, no cryptocurrency symbols, no logos. Museum-quality render, architectural precision, private bank annual report aesthetic. 16:9 aspect ratio, wide cinematic format.
```

**NOTE**: Blog post heroes use **centered composition** (not right-offset). The right-offset layout is only for homepage/landing page hero headers where text overlays the left side.

**Key style principles** (v2 — what makes images match the site headers):
- **Glass dominant**: Frosted translucent glass is the PRIMARY material, not cream. Cream is accent only.
- **Moody lighting**: Dramatic volumetric lighting, objects emerge from darkness with golden hour rim light.
- **Reflective floor**: Polished dark surface with subtle mirror reflections beneath objects.
- **Atmospheric depth**: Subtle fog/mist at base of forms, depth haze in background.
- **Fewer objects**: 3-4 key forms max, generous negative space, museum display presentation.
- **Thin connections**: Delicate gold circuit traces etched into floor — NOT thick industrial pipes.
- **Jewel-like quality**: Objects feel precious and institutional, not toy-like or plastic.

**Scene Descriptions by Cluster**:

#### Data Room Cluster
```
Three frosted glass pavilions on a reflective dark floor representing a complete data room: a translucent glass gear mechanism with gold filigree for Token Design; a frosted glass archive vault with gold-framed document slots for Documentation; a glass dashboard tower with gold chart tracery for Modeling. Thin gold circuit traces etched into the dark floor connecting all three pavilions. Generous spacing between forms.
```

#### RWA Cluster — General
```
Tokenized real-world asset collection on a reflective dark surface: a translucent glass office tower with gold-trimmed segmented floors, a frosted glass vault cube with gold filigree door, and a sleek glass energy pylon with gold conductor lines. Three key forms only, well-spaced apart. Thin gold circuit traces in the dark floor connecting assets to a shared central node.
```

#### RWA Cluster — Real Estate
```
Tokenized real estate on a polished dark reflective surface: CENTER a tall translucent glass office tower with gold-trimmed floor plates showing fractional segments; LEFT a frosted glass residential building with gold balcony details; RIGHT terrain blocks as dark glass platforms with gold survey line markings. Three forms with generous spacing between them. Thin gold circuit traces etched into the reflective floor connecting the structures.
```

#### Token Standards Cluster
```
Modular token architecture on a dark reflective surface: three distinct frosted glass geometric modules — a cube, a hexagonal prism, and a cylinder — each with unique gold filigree circuit patterns on their surfaces. Modules slightly separated but connected by thin gold trace lines etched into the polished dark floor. A small frosted glass compliance shield with gold checkmark detail floats nearby. Minimal composition, museum display spacing.
```

#### Design Fundamentals Cluster
```
Token mechanism design on a dark reflective surface: CENTER a translucent glass precision gear assembly with gold-trimmed interlocking cogs, glowing faintly from within. LEFT a frosted glass arch form representing supply-demand curves with gold edge detailing. RIGHT a glass flywheel mechanism with gold energy traces flowing through it. Three key objects only, well-spaced. Blueprint-subtle grid lines visible in the reflective dark floor beneath.
```

#### Compliance & Regulation Cluster
```
Regulatory framework on a dark reflective surface: CENTER translucent glass balanced scales with gold filigree framework, softly glowing. LEFT a frosted glass fortress vault with gold-trimmed security gate layers. RIGHT a structured glass grid of regulatory blocks with gold connection traces. Three key forms with generous spacing. Thin gold circuit traces etched into the polished dark floor connecting all elements.
```

#### Buyer's Journey Cluster
```
Decision pathway on a dark reflective surface: a luminous frosted glass pathway with gold edge trim leads from LEFT (overlapping translucent glass panels representing complexity) through CENTER (gold-trimmed evaluation gate archways) to RIGHT (a clear, well-lit glass structure representing clarity). Atmospheric fog along the pathway. Minimal forms, generous negative space, the pathway itself is the hero element.
```

---

### 2. OG Images (Social/Search Preview)

**Purpose**: Image for social media shares, Google search results, and link previews.

**Specs**:
- Base: 1200x630 (cropped from hero)
- Overlay via Sharp compositing (NOT AI-generated text)
- Output: JPG + WebP at 1200x630

**Overlay Design**:
- **Logo**: `tokenomics-logo-light.svg` composited **top-left** at **500px wide**, 32px from top / 36px from left — must be prominent and immediately recognizable
- **Logo vignette shadow**: Soft blurred ellipse behind logo area (SVG `feGaussianBlur` with `stdDeviation="60"`, Charcoal fill at 0.9 opacity). Creates a natural vignette that ensures logo legibility over any hero image. No hard edges.
- **Bottom gradient**: Linear gradient, transparent → 50% opacity at 25% → 92% opacity Charcoal (#1A1714) at bottom
- **Title text**: Libre Baskerville Bold, Cream (#FAF8F5), **64px base** → steps down to 52px (3+ lines) → 44px (4+ lines) for longer titles
- Title anchored **bottom-left**, 48px margin from edges, 40px bottom margin

**Layout**:
```
┌──────────────────────────────────┐
│ ░░[Logo ~500px wide]░░           │ ← top-left, soft vignette shadow behind
│  ░░░░░░░░░░░░░░░░░░░            │
│         (hero image visible)     │ ← hero imagery clear in center
│                                  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← bottom gradient for readability
│▓ Big Bold Title Text            ▓│ ← Libre Baskerville Bold 64px, Cream
└──────────────────────────────────┘
░ = soft blurred vignette (no hard edges)
▓ = linear gradient overlay
```

---

### 3. Inline Diagrams (Mermaid)

**Purpose**: Visual explanations within blog posts — flowcharts, allocation charts, revenue flows, timelines, architectures, comparison matrices.

**Technology**: [Mermaid.js](https://mermaid.js.org/) rendered via `@mermaid-js/mermaid-cli` (mmdc) to PNG with brand theming.

**Why Mermaid**: Diagrams are code — editable, reproducible, version-controlled. No AI-generated text issues. Perfect typography every time using our brand fonts (Libre Baskerville + Libre Franklin). Charcoal/cream/gold palette applied automatically via brand config.

**Specs**:
- Source: `.mmd` files (Mermaid syntax) — saved alongside rendered images
- Rendered: PNG at 3x scale via Puppeteer
- Optimized: 800w JPG + WebP
- Brand config: `brand/mermaid-config.json` (theme variables)
- Brand fonts: `brand/mermaid-styles.css` (Libre Baskerville + Libre Franklin via file:// URLs)
- Renderer: `node scripts/mermaid-render.mjs render <file.mmd> --slug [slug] --name [name] --output [dir]`

**Available Diagram Types** (6 core types, all branded):

| Type | Best For | Example Use |
|---|---|---|
| **Flowchart** | Processes, decisions, system flows | Token lifecycle, compliance pathways |
| **Pie Chart** | Proportional breakdowns | Token allocation, revenue splits |
| **Sankey** | Value flow through systems | Revenue waterfall, token distribution |
| **Timeline** | Events over time | Launch roadmap, vesting schedule |
| **Block Diagram** | System architecture, layers | Data room structure, protocol layers |
| **Quadrant Chart** | Comparison matrices | Risk assessment, standard comparison |

**Full template syntax and examples**: See `brand/mermaid-templates.md`

**Diagram Count Per Post**:
- Support posts (1,200-2,000 words): 1-2 diagrams
- Pillar posts (2,500+ words): 2-3 diagrams
- Maximum: 3 diagrams per post
- Minimum: 1 diagram per post (every post gets at least one visual)

**MDX Embedding** (mandatory — diagrams must be inline in the MDX, not added later):
```markdown
![Descriptive alt text for accessibility and figcaption](/images/blog/[slug]-[diagram-name].jpg)
```
- Place AFTER the paragraph that introduces the concept being visualized
- The site's MDXImage component auto-wraps in `<figure>` with styled `<figcaption>` from the alt text
- Path format: `/images/blog/[slug]-[diagram-name].jpg` (matches publish destination)

**Output Structure** (per diagram):
```
assets/diagrams/
  ├── [name].mmd               # Mermaid source (editable)
  ├── [name]-base.png           # Full-resolution rendered PNG
  ├── [name]-base-800w.jpg      # Optimized for blog
  └── [name]-base-800w.webp     # WebP for blog
```

**Known Limitation**: Sankey diagram node colors don't fully respond to theme variables yet (Mermaid open issue). The flow visualization and gradient links still work well — just not perfectly brand-colored nodes.

---

## Logo Compositing via Sharp

For OG images and any post-processed assets:
- Use `uploads/logos/tokenomics-logo-light.svg` on dark backgrounds
- Use `uploads/logos/tokenomics-logo-dark.svg` on light backgrounds
- Logo SVG is converted to PNG via Sharp for compositing (ensures clean rendering at all sizes)
- **OG images**: Logo is **500px wide**, positioned **top-left** (32px from top, 36px from left), with a soft blurred vignette shadow behind it for legibility
- Diagrams use Mermaid (not Gemini) — no logo compositing needed for diagrams

---

## Quality Standards

- All base assets saved at maximum available resolution (4K for heroes, 2K for diagrams)
- Optimized variants: hero < 150KB, diagrams < 100KB, OG < 80KB
- WebP is the primary format for the site, JPG as fallback
- OG images must be JPG (some platforms don't support WebP)
- Base assets preserved in `assets/` for brand reuse
