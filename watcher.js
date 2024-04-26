
import process from 'node:process';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar'
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
      this.watcher = chokidar.watch(this.path, { cwd: this.path });
      const mapToCID = async (path) => {
        const cid = await fromStream(createReadStream(join(this.path, path)));
        this.cid2path[cid] = path;
        this.path2cid[path] = cid;
        return cid;
      };
      const update = (type, cid) => {
        if (!this.eventing) return;
        process.nextTick(() => this.emit('update', this.cid2path, type, cid));
      };
      this.watcher.on('add', async (path) => {
        const cid = await mapToCID(path);
        // console.warn(`# add ${path} (${stats ? stats.size : 'NO STATS'})`);
        update('add', cid);
      });
      this.watcher.on('change', async (path) => {
        if (this.path2cid[path]) delete this.cid2path[this.path2cid[path]];
        const cid = await mapToCID(path);
        // console.warn(`# change ${path} (${stats ? stats.size : 'NO STATS'})`);
        // console.warn(`#   new CID (${path}): ${cid}`);
        update('change', cid);
      });
      this.watcher.on('unlink', async (path) => {
        // console.warn(`# del ${path}`);
        const cid = this.path2cid[path];
        if (cid) delete this.cid2path[cid];
        delete this.path2cid[path];
        update('delete', cid);
      });
      this.watcher.on('ready', () => {
        // console.warn(`# ready!`);
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
