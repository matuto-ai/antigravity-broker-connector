import { validateUuid, validateMetadata } from '../vendor/psst/src/protocol.mjs';

/** Only MCP transport params._meta is accepted here, never model tool arguments. */
export function nativeRootConversation(meta) {
  try {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw Error();
    const root = validateUuid(meta['antigravity.google/root_conversation_id']);
    const self = validateUuid(meta['antigravity.google/conversation_id']);
    if (root !== self) throw Error();
    return root;
  } catch { throw Error('native_root_context_rejected'); }
}

/** Only sanitized native observations; never full hook events, paths or environment. */
export function boundedNativeObservation(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['model','project'].includes(key))) throw Error('native_observation_rejected');
  const clean = {};
  if (Object.hasOwn(value,'model')) {
    const model = validateMetadata({model:value.model},{patch:true}).model;
    if(model.source !== 'observed' || model.provider !== null || model.id === null) throw Error('native_observation_rejected');
    clean.model = model;
  }
  if (Object.hasOwn(value,'project')) {
    const project = validateMetadata({project:value.project},{patch:true}).project;
    if(project !== null && (/[\\/]/u.test(project) || project === '.' || project === '..')) throw Error('native_observation_rejected');
    clean.project = project;
  }
  return clean;
}
