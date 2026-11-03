import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {trustState} from './trust-state.mjs';
const screen=JSON.parse(readFileSync(new URL('./recorded-trust-screen.json',import.meta.url),'utf8'));
const granted={authorizedFixtureWorkspaceTrust:true};
test('actual trust modal recognized but default and nonboolean grants never authorize',()=>{
 assert.equal(trustState(screen).recognized,true);assert.equal(trustState(screen).mayAccept,false);
 for(const value of [false,undefined,null,1,'true',{},[]])assert.equal(trustState(screen,{authorizedFixtureWorkspaceTrust:value}).mayAccept,false);
 assert.equal(trustState(screen,granted).mayAccept,true);
});
test('only exact ephemeral path permitted, never prefixes suffixes or traversal',()=>{
 for(const path of ['/tmp/proof-extra','/tmp/proof/sub','/tmp/proof/../user','/home/user','/tmp/other','/tmp/proof/','/tmp/Proof']){const result=trustState(screen.replace('/tmp/proof',path),granted);assert(!result.recognized);assert(!result.mayAccept);}
});
test('missing choice, duplicate focus or modified permissions and extra modal reject',()=>{
 for(const value of [screen.replace('No, exit',''),screen.replace('  No, exit','> No, exit'),screen.replace('> Yes, I trust this folder','  Yes, I trust this folder'),screen.replace('read, edit, and execute','read all files and execute'),screen+'\nSign in now',screen.replace('Accessing workspace:','Trust all workspaces:'),screen+'\x1b[2J'])assert(!trustState(value,granted).mayAccept);
});
test('terms screen and an arbitrary normal composer never match trust',()=>{
 for(const value of ['> Yes, I trust this folder','> ','Terms of Service & Data Use','x'.repeat(8193),null])assert(!trustState(value,granted).mayAccept);
});
