import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { connectPairingFile, readEnrollmentReceipt } from '../vendor/psst/enrollment.mjs';
import { readConnectorConfig } from './connector-config.mjs';

export function pairingOptions(args, home = homedir()) {
  if (!Array.isArray(args) || args[0] !== 'pair' || ![3, 5].includes(args.length)
    || args[1] !== '--pairing-file' || !isAbsolute(args[2])
    || (args.length === 5 && (args[3] !== '--directory' || !isAbsolute(args[4])))) throw new Error('invalid_pairing_arguments');
  return { pairingFile: args[2], directory: args[4] ?? join(home, '.config', 'psst', 'antigravity') };
}

/** Explicit enrollment only. Does not claim to attach or wake a native session. */
export async function pairConnector(options, dependencies = {}) {
  const result = await connectPairingFile({ ...options, clientType: 'antigravity-cli' }, dependencies);
  readConnectorConfig(result.connectionFile, {});
  const receipt = readEnrollmentReceipt({ connectionFile: result.connectionFile, clientType: 'antigravity-cli' });
  if (receipt.credentialId !== result.credentialId || receipt.expiresAt !== result.expiresAt) throw new Error('invalid_enrollment_receipt');
  return { ...result, connected: false, next_step: 'Pairing saved authorization only. Production requires the native automatic-delivery plugin; legacy stdio is diagnostic/test-only. No native conversation was connected.' };
}
