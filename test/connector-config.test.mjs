import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConnectorConfig } from '../src/connector-config.mjs';

function files(t) { const dir=mkdtempSync(join(tmpdir(),'psst-connector-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir; }
test('config accepts private common bundle; rejects permissive, linked, insecure and wrong-client inputs',t=>{
  const dir=files(t),path=join(dir,'connection.json');
  const bundle={format:'broker-client-bundle-v1',protocol_version:'1',broker_url:'https://broker.example',token_file:'token',file_paths_relative_to:'connection_file_directory',authorization_header:'Authorization',authorization_scheme:'Bearer',insecure_development:false,allowed_client_types:['antigravity-cli'],scope:'psst'};
  const write=value=>writeFileSync(path,JSON.stringify(value),{mode:0o600});write(bundle);
  const config=readConnectorConfig(path,{});assert.equal(config.tokenFile,join(dir,'token'));assert.equal(config.name,'Antigravity');
  assert.equal(config.stateRoot,join(dir,'state'));assert.equal(config.metadata.model.source,'unknown');
  chmodSync(path,0o644);assert.throws(()=>readConnectorConfig(path,{}),/invalid_connector_configuration/);chmodSync(path,0o600);
  const link=join(dir,'link');symlinkSync(path,link);assert.throws(()=>readConnectorConfig(link,{}));
  for(const override of [{broker_url:'http://broker.example'},{token_file:'../token'},{allowed_client_types:['pi']},{authorization_scheme:'Basic'},{surprise:true}]){write({...bundle,...override});assert.throws(()=>readConnectorConfig(path,{}));}
});
