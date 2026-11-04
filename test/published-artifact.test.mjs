import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublishedMetadata } from '../scripts/verify-published-artifact.mjs';
const evidence={package:{name:'@matuto-ai/antigravity-psst-connector',version:'9.8.7'},tarball:{integrity:'sha512-exact-tested-fixture'}};
const metadata={name:evidence.package.name,version:evidence.package.version,dist:{integrity:evidence.tarball.integrity}};
test('publication receipt must identify the exact tested tarball and current latest tag',()=>{
 assert.deepEqual(verifyPublishedMetadata({evidence,metadata,latest:'9.8.7'}),{name:metadata.name,version:'9.8.7',integrity:evidence.tarball.integrity,latest:'9.8.7'});
 for(const changed of [{...metadata,name:'old-name'},{...metadata,version:'0.1.1'},{...metadata,dist:{integrity:'sha512-different'}},{...metadata,dist:{}}])assert.throws(()=>verifyPublishedMetadata({evidence,metadata:changed,latest:'9.8.7'}),/mismatch/);
 assert.throws(()=>verifyPublishedMetadata({evidence,metadata,latest:'9.8.8'}),/latest_tag_mismatch/);
});
