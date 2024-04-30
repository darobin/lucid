
import { mkdtemp, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Watcher from "../../watcher.js";

export async function setUpSource (fixtures) {
  let tmpDir, w, initialData;
  tmpDir = await mkdtemp(join(tmpdir(), 'lucid-'));
  await Promise.all(['index.html', 'wtf.jpg'].map(f => cp(join(fixtures, f), join(tmpDir, f))));
  // there's a lovely race condition with cp()
  await new Promise((resolve) => setTimeout(resolve, 100));
  w = new Watcher(tmpDir);
  initialData = await w.run();
  return { tmpDir, w, initialData };
}

export function tearDownSource (w) {
  w?.stop();
}
