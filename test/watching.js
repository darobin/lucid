
import { equal, deepEqual } from 'node:assert';
import { mkdtemp, cp } from 'node:fs/promises';
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
  // XXX
  // - add a file
  // - touch a file
  // - change a file
  // - delete a file
});
