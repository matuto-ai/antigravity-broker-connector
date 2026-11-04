import packageInfo from '../package.json' with { type: 'json' };

if (packageInfo.name !== '@matuto-ai/antigravity-psst-connector'
  || typeof packageInfo.version !== 'string' || packageInfo.version.length > 128
  || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(packageInfo.version)) {
  throw new Error('invalid_connector_runtime_metadata');
}

// Snapshot the executing package metadata once. Never infer this process's
// version from cwd, a later manager install, native settings or host identity.
// This is descriptive metadata, not package attestation or delivery readiness.
export const CONNECTOR_RUNTIME = Object.freeze({
  name: packageInfo.name,
  version: packageInfo.version,
});
