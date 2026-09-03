import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { repoPath } from './support/repo';

function deploySshScript(): string {
  const workflow = readFileSync(repoPath('.github/workflows/deploy.yml'), 'utf8');
  const deployStep = workflow.slice(workflow.indexOf('      - name: Deploy over SSH'));
  const match = deployStep.match(/\n          script: \|\n([\s\S]*?)(?=\n      - name: |\s*$)/);

  if (!match?.[1]) throw new Error('Deploy over SSH script block not found');

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^ {12}/, ''))
    .join('\n')
    .replace('cd "${{ secrets.DEPLOY_PATH }}"', 'cd "$DEPLOY_PATH"');
}

function executable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

describe('deploy workflow', () => {
  it('never starts Compose dependencies when API migrations are disabled', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'bookingos-deploy-'));
    const bin = join(fixture, 'bin');
    const deployPath = join(fixture, 'server');
    const dockerLog = join(fixture, 'docker.log');

    mkdirSync(bin);
    mkdirSync(join(deployPath, 'docker', 'caddy'), { recursive: true });
    writeFileSync(join(deployPath, '.env.stg'), 'DATABASE_URL=postgresql://fixture\n');
    writeFileSync(join(deployPath, 'docker-compose.deploy.yml'), 'services: {}\n');
    writeFileSync(join(deployPath, 'docker-compose.stg-data.yml'), 'services: {}\n');
    writeFileSync(join(deployPath, 'docker', 'caddy', 'Caddyfile'), 'fixture\n');

    executable(
      join(bin, 'docker'),
      `#!/usr/bin/env bash
if [ "\${1:-}" = "login" ]; then cat >/dev/null; fi
printf '%s\\n' "$*" >> "$DOCKER_LOG"
`,
    );
    executable(
      join(bin, 'sha256sum'),
      `#!/usr/bin/env bash
if [ "$#" -eq 0 ]; then cat >/dev/null; fi
printf 'fixture-sha  -\\n'
`,
    );

    const result = spawnSync('bash', ['-c', deploySshScript()], {
      encoding: 'utf8',
      env: {
        ...process.env,
        APP: 'api',
        DEPLOY_PATH: deployPath,
        DOCKER_LOG: dockerLog,
        ENVIRONMENT: 'stg',
        GHCR_TOKEN: 'fixture-token',
        MIGRATE: 'false',
        OWNER: 'FixtureOwner',
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        TAG: 'sha-fixture',
      },
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const dockerCalls = readFileSync(dockerLog, 'utf8').trim().split('\n');
    expect(dockerCalls).not.toContainEqual(expect.stringContaining('run --rm migrate'));
    expect(dockerCalls).toContain(
      'compose --env-file .env.stg -f docker-compose.deploy.yml -f docker-compose.stg-data.yml up -d --no-deps api',
    );
    expect(dockerCalls).toContain(
      'compose --env-file .env.stg -f docker-compose.deploy.yml -f docker-compose.stg-data.yml up -d --no-deps --remove-orphans --force-recreate caddy',
    );
  });
});
