// Read-only registry verification after an explicitly authorized publication.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCandidate } from './candidate-artifact.mjs';

export function verifyPublishedMetadata({ evidence, metadata, latest }) {
  assert(metadata?.name === evidence.package.name, 'published_package_name_mismatch');
  assert(metadata.version === evidence.package.version, 'published_package_version_mismatch');
  assert(metadata.dist?.integrity === evidence.tarball.integrity, 'published_artifact_integrity_mismatch');
  assert(latest === evidence.package.version, 'published_latest_tag_mismatch');
  return { name: metadata.name, version: metadata.version, integrity: metadata.dist.integrity, latest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceRoot, artifactRoot] = process.argv.slice(2);
  assert(sourceRoot && artifactRoot && process.argv.length === 4, 'source_and_candidate_required');
  const candidate = verifyCandidate({ sourceRoot, artifactRoot, requireClean: true });
  const view = args => {
    const result = spawnSync('npm', ['view', ...args, '--json', '--registry=https://registry.npmjs.org', '--fetch-retries=0'],
      { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
    assert(!result.error && result.status === 0, 'published_registry_read_failed');
    return JSON.parse(result.stdout);
  };
  let result, failure;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = verifyPublishedMetadata({ evidence: candidate.evidence,
        metadata: view([`${candidate.evidence.package.name}@${candidate.evidence.package.version}`]),
        latest: view([candidate.evidence.package.name, 'dist-tags.latest']) });
      break;
    } catch (error) { failure = error; if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  if (!result) throw failure;
  verifyCandidate({ sourceRoot, artifactRoot, requireClean: true });
  console.log(JSON.stringify({ published_artifact: 'verified', ...result, source_commit: candidate.evidence.source.commit }));
}
