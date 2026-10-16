import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopWebPreferences, isDesktopUrl } from '../src/desktop/policy.js';
import { startStudio } from '../src/studio/server.js';
import { get } from 'node:http';
test('desktop renderer stays sandboxed and navigation is restricted to its exact loopback origin',()=>{
  assert.equal(desktopWebPreferences.nodeIntegration,false);assert.equal(desktopWebPreferences.contextIsolation,true);assert.equal(desktopWebPreferences.sandbox,true);
  assert.equal(isDesktopUrl('http://127.0.0.1:4321/','http://127.0.0.1:4321'),true);
  for(const url of ['https://example.invalid','file:///C:/Windows/win.ini','http://127.0.0.1:4322','javascript:alert(1)','http://127.0.0.1:4321.evil.invalid']) assert.equal(isDesktopUrl(url,'http://127.0.0.1:4321'),false);
});
test('desktop studio selects its own free port and rejects a different Host',async()=>{
  const studio=await startStudio(0);
  try {
    assert.ok(!studio.origin.endsWith(':0'));assert.equal(new URL(studio.origin).hostname,'127.0.0.1');assert.equal((await fetch(studio.origin)).status,200);
    const status = await new Promise<number|undefined>((resolve,reject) => {get(studio.origin,{headers:{Host:'evil.invalid'}},response => {response.resume();resolve(response.statusCode);}).on('error',reject);});
    assert.equal(status,403);
  }
  finally {await studio.close();}
});
