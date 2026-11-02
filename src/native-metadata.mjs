import { isAbsolute } from 'node:path';
import { canonical, validateMetadata } from '../vendor/psst/src/protocol.mjs';
import { projectMetadata } from './project-metadata.mjs';

/** Call only after nativeHookContext verified the host-provided event. */
export function nativeMetadataObservation(input) {
  const observation = {};
  if (typeof input.modelName === 'string' && input.modelName.trim()) {
    try { observation.model = validateMetadata({model:{provider:null,id:input.modelName,source:'observed'}},{patch:true}).model; } catch {}
  }
  // Multiple mounted roots do not identify one project. Never expose a full path.
  if (Array.isArray(input.workspacePaths) && input.workspacePaths.length === 1) {
    const cwd = input.workspacePaths[0];
    if (typeof cwd === 'string' && cwd.length <= 4096 && isAbsolute(cwd)) {
      try { observation.project = projectMetadata({}, {}, cwd); } catch {}
    }
  }
  return observation;
}

/** Stored native events are private host records, never MCP/model arguments. */
export function nativeMetadata(config, event, {host, conversationId}, env = process.env) {
  const fallback = config.metadata;
  if (!fallback || event?.conversationId !== conversationId || canonical(event?.host ?? null) !== canonical(host)) return fallback;
  const observed = event.metadata ?? {};
  let model = fallback.model;
  if (observed.model?.source === 'observed') {
    try { model = validateMetadata({model:observed.model},{patch:true}).model; } catch {}
  }
  // Configuration and the selected operator environment beat native workspace fallback.
  let project = projectMetadata(config, env);
  if (project === null) {
    try { project = projectMetadata({project:observed.project}, {}); } catch {}
  }
  return validateMetadata({...fallback, model, project});
}
