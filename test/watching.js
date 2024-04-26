
import { equal, deepEqual } from 'node:assert';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import makeRel from '../lib/rel.js';
import Watcher from "../watcher.js";

const rel = makeRel(import.meta.url);
const fixtures = rel('./fixtures');
let tmpDir;
let w;
let initialData;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'lucid-'));
  await Promise.all(['index.html', 'wtf.jpg'].map(f => cp(join(fixtures, f), join(tmpDir, f))));
  // there's a lovely race condition with cp()
  await new Promise((resolve) => setTimeout(resolve, 100));
  w = new Watcher(tmpDir);
  initialData = await w.run();
});
after(async () => {
  w?.stop();
});
describe('Watcher', () => {
  it('correctly processes initial directory', () => {
    deepEqual(
      initialData, 
      {
        bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq: "index.html",
        bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu: "wtf.jpg",
      },
      'initial read correct'
    );
  });
  it('processes adding a file', async function () {
    this.timeout(5000);
    const p = new Promise((resolve, reject) => {
      w.once('update', (map, type, cid) => {
        try {
          equal(type, 'add', 'we see an addition');
          equal(cid, 'bafkr4idla6d37zoddo4i4wvs5zkuxwvyuczpwjjna6xcx4uj7bpmy3276i', 'correct CID');
          deepEqual(
            map, 
            {
              bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq: "index.html",
              bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu: "wtf.jpg",
              bafkr4idla6d37zoddo4i4wvs5zkuxwvyuczpwjjna6xcx4uj7bpmy3276i: "poem.txt",
            },
            'map correct'
          );
          resolve();
        }
        catch (err) {
          reject(err);
        }
      });
    });
    await cp(join(fixtures, 'poem.txt'), join(tmpDir, 'poem.txt'));
    return p;
  });
  it('processes changing a file', async function () {
    this.timeout(5000);
    const p = new Promise((resolve, reject) => {
      w.once('update', (map, type, cid) => {
        try {
          equal(type, 'change', 'we see a change');
          equal(cid, 'bafkr4ib47dntyr4jhcgcbx3wknk7okpidiuikc6x4ulsvurlrzsgxpmjlm', 'correct CID');
          deepEqual(
            map, 
            {
              bafkr4ib47dntyr4jhcgcbx3wknk7okpidiuikc6x4ulsvurlrzsgxpmjlm: "index.html",
              bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu: "wtf.jpg",
              bafkr4idla6d37zoddo4i4wvs5zkuxwvyuczpwjjna6xcx4uj7bpmy3276i: "poem.txt",
            },
            'map correct'
          );
          resolve();
        }
        catch (err) {
          reject(err);
        }
      });
    });
    await writeFile(join(tmpDir, 'index.html'), 'This file now intentionally left blank.');
    return p;
  });
  it('processes deleting a file', async function () {
    this.timeout(5000);
    const p = new Promise((resolve, reject) => {
      w.once('update', (map, type, cid) => {
        try {
          equal(type, 'delete', 'we see a deletion');
          equal(cid, 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu', 'correct CID that was deleted');
          deepEqual(
            map, 
            {
              bafkr4ib47dntyr4jhcgcbx3wknk7okpidiuikc6x4ulsvurlrzsgxpmjlm: "index.html",
              bafkr4idla6d37zoddo4i4wvs5zkuxwvyuczpwjjna6xcx4uj7bpmy3276i: "poem.txt",
            },
            'map correct'
          );
          resolve();
        }
        catch (err) {
          reject(err);
        }
      });
    });
    await rm(join(tmpDir, 'wtf.jpg'));
    return p;
  });
});