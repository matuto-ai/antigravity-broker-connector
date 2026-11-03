// Pure fake-provider state machine: normal native lazy wrapper, only two granted tools.
import assert from 'node:assert/strict';
import {ACTUAL_SERVER,ACTUAL_TOOLS} from './actual-plugin-fixture.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function objects(value,depth=0){
 if(depth>12)return [];
 if(typeof value==='string'){try{return objects(JSON.parse(value),depth+1);}catch{return [];}}
 if(!value||typeof value!=='object')return [];
 return [value,...Object.values(value).flatMap(v=>objects(v,depth+1))];
}
// Prefix display is a fixed vocabulary projection, not arbitrary string logging.
export function nativeNoticeShape(text){
 const start=text.indexOf('{'),prefix=(start<0?text:text.slice(0,start)).slice(0,512);
 const words=new Set(['A','pre-tool','it','ran','ran.','Hook','hook','hooks','Tool','tool','call','arguments','Arguments','argument','modified','changed','overwritten','overwrite','PreToolUse','Note','note','The','the','following','by','was','were','has','have','been','to','from','with','and','for','before','execution','result','results','output','input','parameters','parameter','This','this','is','a','an','of','on','keys','key']);
 const punctuation=new Set([':',',','.',';','(',')','[',']',"'",'"','`','-','=','>','<']);
 const tokens=prefix.match(/[A-Za-z0-9_/@.%+\-]+|[\s\S]/g)??[];
 const shape=tokens.slice(0,96).map(token=>words.has(token)?token:/^\s$/.test(token)?' ':punctuation.has(token)?token:'?').join('').replace(/ +/g,' ').trim();
 let trailingObject=false;
 if(start>=0){try{const value=JSON.parse(text.slice(start));trailingObject=Boolean(value&&typeof value==='object'&&!Array.isArray(value));}catch{}}
 return {shape,prefixTruncated:(start<0?text.length:start)>512||tokens.length>96,hasObjectStart:start>=0,trailingObject};
}
// Diagnostics never return arbitrary keys, text, URLs, paths, IDs, tokens or permits.
export function actualResponseDiagnostics(value){
 const all=objects(value),strings=[];
 function collect(v,d=0){if(d>12)return;if(typeof v==='string'){strings.push(v);return;}if(v&&typeof v==='object')for(const child of Object.values(v))collect(child,d+1);}
 collect(value);
 const states=['setup_needed','attention_required','pending','approved','connected','cancelled','denied','expired'];
 const errors=['native_binding_rejected','native_root_context_rejected','native_root_setup_required','native_not_connected','native_host_unavailable','native_owner_unavailable','invalid_connector_configuration','invalid_installation_selection','installation_identity_changed','unauthenticated','forbidden','invalid_response','internal_error'];
 return {responseType:Array.isArray(value)?'array':typeof value,parsedObjects:all.length,wrapperKeys:Object.fromEntries(['output','result','content','text','error','data','response'].map(key=>[key,Boolean(value&&typeof value==='object'&&Object.hasOwn(value,key))])),noticeShapes:strings.slice(0,8).map(nativeNoticeShape),
  connected:all.filter(v=>typeof v.connected==='boolean').map(v=>v.connected).slice(0,8),
  modes:all.filter(v=>v.mode==='automatic_required').map(()=> 'automatic_required').slice(0,8),
  states:[...new Set(all.map(v=>v.state).filter(v=>states.includes(v)))],
  isError:all.filter(v=>typeof v.isError==='boolean').map(v=>v.isError).slice(0,8),
  knownErrors:errors.filter(code=>strings.some(text=>new RegExp('(?:^|[^a-z_])'+code+'(?:$|[^a-z_])').test(text))),
  textShape:{strings:strings.length,jsonParseable:strings.filter(v=>{try{JSON.parse(v);return true;}catch{return false;}}).length,
   fencedJson:strings.some(v=>/```(?:json)?\s*[\[{]/i.test(v)),hasConnectedTrue:strings.some(v=>/"connected"\s*:\s*true/.test(v)),hasConnectedFalse:strings.some(v=>/"connected"\s*:\s*false/.test(v)),hasAutomaticMode:strings.some(v=>/"mode"\s*:\s*"automatic_required"/.test(v))}};
}
export function actualProviderStep(input,state){
 const next={...state};let identity;
 const responses=(input.contents??[]).flatMap(c=>c.parts??[]).filter(p=>p.functionResponse?.name==='call_mcp_tool').map(p=>p.functionResponse.response);
 if(next.sent>next.completed){
  assert(responses.length,'missing native tool response');
  const found=objects(responses.at(-1));
  if(next.completed===0){if(!found.some(v=>v.connected===true&&v.mode==='automatic_required'))throw Object.assign(Error('actual setup status not connected'),{proofDiagnostics:actualResponseDiagnostics(responses.at(-1))});}
  else {const value=found.find(v=>v.native_session_binding===true&&v.endpoint_scope==='experimental_native_conversation'&&uuid.test(v.conversation_id??'')&&typeof v.client_id==='string');
   assert(value,'actual identity response missing');identity={conversation_id:value.conversation_id,client_id:value.client_id,native_session_binding:true,endpoint_scope:value.endpoint_scope};}
  next.completed++;
 }
 if(next.sent<ACTUAL_TOOLS.length){
  const declarations=input.tools?.flatMap(t=>t.functionDeclarations??[])??[];
  // Native title/warmup requests have no tools. Never advance the proof on these.
  if(declarations.length===0&&state.sent===state.completed)return {state:next,identity,parts:[{text:'OFFLINE_ACTUAL_PROBE_READY'}]};
  const def=declarations.find(f=>f.name==='call_mcp_tool');
  const schema=def?.parametersJsonSchema??def?.parameters;
  assert(['ServerName','ToolName','Arguments'].every(k=>schema?.properties?.[k])&&(!schema.properties.Arguments.type||schema.properties.Arguments.type==='object'),'unsupported actual lazy schema');
  const tool=ACTUAL_TOOLS[next.sent++];
  return {state:next,identity,parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:ACTUAL_SERVER,ToolName:tool,Arguments:{}}}}]};
 }
 return {state:next,identity,parts:[{text:'OFFLINE_ACTUAL_PROBE_FINISHED'}]};
}
