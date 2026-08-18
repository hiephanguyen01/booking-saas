import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A tenant's `theme_config.surface` drives `--sf-surface-radius`, `--sf-image-radius`,
 * `--sf-surface-shadow` and `--sf-surface-border-*`. Those tokens apply at EVERY width,
 * so writing a fixed shape on top of one at a desktop breakpoint silently throws the
 * tenant's configuration away above that breakpoint.
 *
 * This is not hypothetical. The tokens were introduced (`eef5dc0e`, "improve tenant
 * config") by adding the token and KEEPING the old literal as a `md:` override:
 *
 *     -  className="… rounded-md"
 *     +  className="… rounded-(--sf-image-radius) md:rounded-md"
 *
 * Every such site was mobile-only until 2026-08-18. This guard stops it coming back.
 *
 * `max-*:` variants are the opposite case and are deliberately NOT flagged: they
 * suppress the frame below a breakpoint so a card runs edge-to-edge on a phone, and
 * the tenant's shape still applies from that breakpoint up.
 */

const root = process.cwd();
const SCAN_ROOT = 'apps/storefront/app';
const failures = [];

/** Something on this line is a tenant-configured surface. */
const SURFACE =
  /--sf-surface-radius|--sf-image-radius|--sf-surface-shadow|--sf-surface-border|PANEL_SURFACE|SURFACE_FRAME|SURFACE_OUTLINE|<SectionCard|<AccountPanel/;

/**
 * A breakpoint override that SUBSTITUTES a fixed shape for the tenant's.
 *
 * Substitution is the bug: `rounded-(--sf-image-radius) md:rounded-md` says "the
 * tenant's radius applies on phones only". REMOVAL is not — `md:rounded-none`,
 * `md:shadow-none` and `md:border-0` mean "this element has no surface at this
 * width", which is a layout decision (a panel dissolving into the frame around it,
 * an image sitting flush in an `overflow-hidden` card). Those are left alone, which
 * is why this guard needs no allowlist.
 *
 * `(?<!max-)` keeps `max-md:*` out of it too: those suppress the frame BELOW a
 * breakpoint, so the tenant's shape still applies from that breakpoint up.
 */
const OVERRIDE =
  /(?<!max-)\b(?:sm|md|lg|xl|2xl):(?:rounded-(?:sm|md|lg|xl|2xl|3xl|full)|shadow-(?:xs|sm|md|lg|xl|2xl)|border(?![-\w]))/g;

/**
 * Empty on purpose. If a genuine exception ever appears, add it here with the reason —
 * an entry whose file disappears fails the check, so the list cannot rot.
 */
const ALLOWLIST = new Map([]);

function collect(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

let scanned = 0;
for (const file of collect(join(root, SCAN_ROOT), [])) {
  const path = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  scanned += 1;
  if (ALLOWLIST.has(path)) continue;
  for (let i = 0; i < lines.length; i += 1) {
    // `cn(SURFACE, '…')` puts the marker and the class string on different lines.
    const window = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
    const hits = lines[i].match(OVERRIDE);
    if (!hits || !SURFACE.test(window)) continue;
    failures.push(
      `${path}:${i + 1}: \`${[...new Set(hits)].join(' ')}\` overrides a tenant surface token — ` +
        `drop it so \`theme_config.surface\` applies at every width`,
    );
  }
}

for (const [path, reason] of ALLOWLIST) {
  try {
    statSync(join(root, path));
  } catch {
    failures.push(`${path}: allowlisted as "${reason}" but the file no longer exists`);
  }
}

if (failures.length > 0) {
  console.error(['Tenant surface check failed:', ...failures.map((item) => `- ${item}`)].join('\n'));
  process.exit(1);
}

console.log(
  `Tenant surface check passed — ${scanned} files keep tenant surface tokens at every ` +
    `breakpoint (${ALLOWLIST.size} layout exemptions).`,
);
