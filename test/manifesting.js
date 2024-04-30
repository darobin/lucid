
import { equal, ok } from 'node:assert';
import { cp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import makeRel from '../lib/rel.js';
import { setUpSource } from './support/tile-source.js';
import Manifest from '../manifest.js';

const rel = makeRel(import.meta.url);
const fixtures = rel('./fixtures');
let tmpDir;
let m;
let w;

before(async () => {
  const res = await setUpSource(fixtures);
  tmpDir = res.tmpDir;
  w = res.w;
  m = new Manifest(tmpDir);
  await m.watch();
});
after(() => {
  m.stop();
  w.stop();
});
describe('Manifest', () => {
  it('default metadata', () => {
    const def = new Manifest(tmpDir);
    const defMan = def.manifest();
    equal(defMan.name, 'Unnamed Tile', 'default name');
    ok(!defMan.description, 'default description');
    def.stop();
  });
  it('given metadata', () => {
    const name = 'Kitsune Tile';
    const description = 'This is the best tile';
    const giv = new Manifest(tmpDir, { name, description });
    const givMan = giv.manifest();
    equal(givMan.name, name, 'given name');
    equal(givMan.description, description, 'given description');
    giv.stop();
  });
  it('correctly processes initial directory', () => {
    const { resources: data } = m.manifest();
    equal(data['/index.html']?.src?.toString(), 'bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq', 'index CID');
    equal(data['/index.html']?.mediaType, 'text/html', 'index media type');
    equal(data['/']?.src?.toString(), 'bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq', 'root CID');
    equal(data['/']?.mediaType, 'text/html', 'root media type');
    equal(data['/wtf.jpg']?.src?.toString(), 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu', 'WTF CID');
    equal(data['/wtf.jpg']?.mediaType, 'image/jpeg', 'WTF media type');
  });
  it('processes adding a file', async function () {
    this.timeout(5000);
    const p = new Promise((resolve, reject) => {
      m.once('update', (man) => {
        try {
          equal(man?.resources?.['/poem.txt']?.src?.toString(), 'bafkr4idla6d37zoddo4i4wvs5zkuxwvyuczpwjjna6xcx4uj7bpmy3276i', 'correct CID');
          equal(man?.resources?.['/poem.txt']?.mediaType, 'text/plain', 'correct media type');
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
      m.once('update', (man) => {
        try {
          equal(man?.resources?.['/index.html']?.src?.toString(), 'bafkr4ib47dntyr4jhcgcbx3wknk7okpidiuikc6x4ulsvurlrzsgxpmjlm', 'updated CID');
          equal(man?.resources?.['/index.html']?.mediaType, 'text/html', 'correct media type');
          equal(man?.resources?.['/']?.src?.toString(), 'bafkr4ib47dntyr4jhcgcbx3wknk7okpidiuikc6x4ulsvurlrzsgxpmjlm', 'updated CID for root');
          equal(man?.resources?.['/']?.mediaType, 'text/html', 'correct media type for root');
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
      m.once('update', (man) => {
        try {
          ok(!man.resources['/wtf.jpg'], 'removed file');
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
