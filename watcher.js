
import process from 'node:process';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { fromStream } from './cid.js';

export default class Watcher extends EventEmitter {
  constructor (path) {
    super();
    this.path = path; // should be absolute
    this.cid2path = {};
    this.path2cid = {};
    this.watcher = null;
    this.eventing = false;
  }
  async run () {
    return new Promise((resolve, reject) => {
      const awaitingAsyncAdds = [];
      this.watcher = chokidar.watch(this.path, { cwd: this.path });
      const mapToCID = async (path) => {
        const cid = await fromStream(createReadStream(join(this.path, path)));
        this.cid2path[cid] = path;
        this.path2cid[path] = cid;
        return cid;
      };
      const update = (type, cid, path) => {
        if (!this.eventing) return;
        process.nextTick(() => this.emit('update', this.cid2path, type, cid, path));
      };
      this.watcher.on('add', async (path) => {
        const p = mapToCID(path);
        if (!this.eventing) awaitingAsyncAdds.push(p);
        const cid = await p;
        // console.warn(`[👁️]  add ${path}`);
        update('add', cid, path);
      });
      this.watcher.on('change', async (path) => {
        if (this.path2cid[path]) delete this.cid2path[this.path2cid[path]];
        const p = mapToCID(path);
        if (!this.eventing) awaitingAsyncAdds.push(p);
        const cid = await p;
        // console.warn(`[👁️]  change ${path}`);
        // console.warn(`#   new CID (${path}): ${cid}`);
        update('change', cid, path);
      });
      this.watcher.on('unlink', (path) => {
        // console.warn(`[👁️]  del ${path}`);
        const cid = this.path2cid[path];
        if (cid) delete this.cid2path[cid];
        delete this.path2cid[path];
        update('delete', cid, path);
      });
      this.watcher.on('ready', async () => {
        await Promise.all(awaitingAsyncAdds);
        // console.warn(`[👁️] ready!`);
        process.nextTick(() => {
          this.eventing = true;
          resolve(this.cid2path);
        });
      });
      this.watcher.on('error', reject);
    });
  }
  lookup (cid) {
    return this.cid2path[cid];
  }
  cidMap () {
    return this.cid2path;
  }
  async stop () {
    return this.watcher.close();
  }
}
