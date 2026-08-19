import { describe, expect, it } from 'vitest';
import { loadSources, repoPath, staleAllowlistEntries } from './support/repo';

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
 */

const SCAN_ROOT = 'apps/storefront/app';

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
const ALLOWLIST = new Map<string, string>([]);

const files = loadSources(repoPath(SCAN_ROOT), new Set(['.tsx']), { skipDotEntries: true });

describe('tenant surface tokens (theme_config.surface)', () => {
  it('scans the storefront app', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never substitutes a fixed shape for a tenant token at a breakpoint', () => {
    const failures: string[] = [];
    for (const { path, source } of files) {
      if (ALLOWLIST.has(path)) continue;
      const lines = source.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        // `cn(SURFACE, '…')` puts the marker and the class string on different lines.
        const window = lines.slice(Math.max(0, index - 3), index + 1).join(' ');
        const hits = (lines[index] as string).match(OVERRIDE);
        if (!hits || !SURFACE.test(window)) continue;
        failures.push(
          `${path}:${index + 1}: \`${[...new Set(hits)].join(' ')}\` overrides a tenant surface ` +
            'token — drop it so `theme_config.surface` applies at every width',
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('carries no stale layout exemption', () => {
    expect(staleAllowlistEntries(ALLOWLIST)).toEqual([]);
  });
});
