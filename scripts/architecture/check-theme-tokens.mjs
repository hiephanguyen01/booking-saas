import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * Every colour on a themed surface must come from a token, so one tenant
 * `theme_config` re-skins the whole storefront (TONG-QUAN.md §16.2). A literal
 * colour is invisible to `themeCss()`, so it survives every theme a tenant picks
 * — which is how a "no shadow" setting still rendered shadows on ten surfaces,
 * and how a dark tenant theme kept a light-theme scrim.
 *
 * Scanned: the storefront app and the shared UI both frontends render.
 * Not scanned: `packages/ui/src/styles/globals.css` and the `.platform-landing`
 * block, which are where the literals are *defined*.
 */

const root = process.cwd();
const failures = [];
const ignoredDirectories = new Set(['.git', 'node_modules', 'build', 'dist', '.react-router']);
const sourceExtensions = new Set(['.ts', '.tsx']);

/**
 * Text over an image is the one place a literal is correct. A photo is supplied
 * by a tenant or a customer and is not themed, so its overlay has to stay white
 * on a dark wash whatever brand colours are configured — deriving it from
 * `--foreground` would put dark text on a dark photo for any light-theme tenant.
 * Each entry names the file and why; nothing lands here without a reason.
 */
const IMAGE_OVERLAY_ALLOWLIST = new Map([
  ['apps/storefront/app/features/home/components/hero.tsx', 'hero copy over the tenant hero photo'],
  [
    'apps/storefront/app/features/site-shell/components/site-header.tsx',
    'desktop header controls over the tenant hero photo',
  ],
  [
    'apps/storefront/app/features/site-shell/components/site-header-mobile-menu.tsx',
    'mobile header trigger over the tenant hero photo',
  ],
  [
    'apps/storefront/app/features/account/components/reviews/review-dialog-view.tsx',
    'controls over customer-uploaded review photos',
  ],
  ['packages/ui/src/components/media/media-viewer-core.tsx', 'full-screen photo viewer'],
  ['packages/ui/src/components/review/review-media-gallery.tsx', 'review photo gallery'],
  ['packages/ui/src/components/form/image-upload.tsx', 'upload controls over the image preview'],
  [
    // Not a dashboard surface: it mocks the *tenant's* storefront from unsaved
    // form values, so its neutrals must stay independent of the dashboard theme
    // or the preview would show the operator's colours instead of the tenant's.
    'apps/dashboard/app/features/tenant/components/settings/storefront-theme-preview.tsx',
    'a mock of the tenant storefront, coloured from form values rather than the dashboard theme',
  ],
]);

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|decoration|divide|caret';

const RULES = [
  {
    name: 'Tailwind palette class',
    re: new RegExp(`\\b(?:${UTILITY})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
    allowImageOverlay: false,
  },
  {
    name: 'literal white/black utility',
    re: new RegExp(`\\b(?:${UTILITY})-(?:white|black)(?:/\\d+)?\\b`, 'g'),
    allowImageOverlay: true,
  },
  {
    // Anchored to a utility prefix so this matches `shadow-[…rgba(…)]` and not a
    // JS array of hex strings — the colour picker's presets are the palette we
    // *offer* a tenant, which is data rather than styling.
    name: 'literal colour in an arbitrary value',
    re: new RegExp(`\\b(?:${UTILITY})-\\[[^\\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()[^\\]]*\\]`, 'g'),
    allowImageOverlay: true,
  },
];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/**
 * Comments are prose, not styling. `section-card.tsx` documents the ten
 * hand-written surfaces it replaced, literal shadows included, and that history
 * is worth more than a clean regex match.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const targets = [
  join(root, 'apps/storefront/app'),
  join(root, 'apps/dashboard/app'),
  join(root, 'packages/ui/src/components'),
];
let scanned = 0;

for (const target of targets) {
  for (const file of walk(target)) {
    if (!sourceExtensions.has(extname(file))) continue;
    const path = relative(root, file);
    const source = stripComments(readFileSync(file, 'utf8'));
    scanned += 1;

    for (const rule of RULES) {
      if (rule.allowImageOverlay && IMAGE_OVERLAY_ALLOWLIST.has(path)) continue;
      for (const match of source.matchAll(rule.re)) {
        failures.push(`${path}: ${rule.name} \`${match[0]}\` — use a theme token instead`);
      }
    }
  }
}

for (const [path, reason] of IMAGE_OVERLAY_ALLOWLIST) {
  try {
    statSync(join(root, path));
  } catch {
    failures.push(`${path}: allowlisted as "${reason}" but the file no longer exists`);
  }
}

if (failures.length > 0) {
  console.error(['Theme token check failed:', ...failures.map((item) => `- ${item}`)].join('\n'));
  process.exit(1);
}

console.log(
  `Theme token check passed — ${scanned} files carry no literal colours ` +
    `(${IMAGE_OVERLAY_ALLOWLIST.size} image-overlay exemptions).`,
);
