#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { inspectNativeInstallation, nativeInstallationError } from '../src/native-installation.mjs';
const usage = 'Usage: psst-antigravity doctor [absolute-plugin-directory] (read-only native installation check)\n        psst-antigravity diagnostic --config /absolute/private/config.json\n       psst-antigravity pair --pairing-file /absolute/private/pairing.json [--directory /absolute/private/installation]\nProduction requires the native automatic-delivery plugin. The cooperative stdio MCP server is diagnostic/test-only; it does not launch or inject into Antigravity.\nPair explicitly enrolls this installation; it does not connect or wake a native conversation.\n';
if (process.argv.length === 3 && ['--help','-h'].includes(process.argv[2])) { process.stdout.write(usage); }
else if (process.argv[2] === 'doctor') {
  try {
    if (process.argv.length > 4) throw Error('absolute_plugin_directory_required');
    const result = inspectNativeInstallation(process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url)));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    const code = /^[a-z0-9_]+$/.test(error.message) ? error.message : 'inspection_failed';
    process.stderr.write(`psst: ${code}: ${nativeInstallationError(code)}\n`); process.exitCode = 1;
  }
}
else if (process.argv[2] === 'pair') {
  try { const { pairingOptions, pairConnector } = await import('../src/pairing.mjs'); process.stdout.write(JSON.stringify(await pairConnector(pairingOptions(process.argv.slice(2)))) + '\n'); }
  catch { process.stderr.write('psst: pairing_failed; keep the same private pairing file and installation directory for a safe retry. No native session was connected.\n'); process.exitCode = 1; }
}
else if (process.argv[2] !== 'diagnostic') {
  process.stderr.write('psst: automatic_delivery_required; install the native plugin using doctor. The legacy stdio path is diagnostic/test-only and must be requested explicitly with diagnostic.\n'); process.exitCode=2;
}
else {
  let connector;
  const controller = new AbortController();
  const stop = () => { controller.abort(); void connector?.close(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const { readConnectorConfig } = await import('../src/connector-config.mjs');
    const { startConnector } = await import('../src/connector.mjs');
    const path = process.argv.length === 5 && process.argv[3] === '--config' ? process.argv[4] : process.argv.length === 3 ? process.env.PSST_CONFIG_FILE : null;
    if (!path) throw new Error();
    process.stdin.pause();
    const config = readConnectorConfig(path);
    connector = await startConnector({config, signal: controller.signal, onDiagnostic: ({code}) => process.stderr.write(`psst: ${code}\n`)});
    process.stdin.resume();
    await connector.done;
  } catch { process.stderr.write('psst: connector_start_failed; check private configuration, Node 24.19+, credential enrollment and broker availability.\n'); process.exitCode=1; }
  finally { await connector?.close(); process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop); }
}
