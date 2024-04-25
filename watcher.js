
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
      };
      const update = () => {
        if (!this.eventing) return;
        this.emit(this.cid2path);
      };
      this.watcher.on('add', async (path) => {
        // console.warn(`add ${path}`);
        await mapToCID(path);
        update();
      });
      this.watcher.on('change', async (path) => {
        // console.warn(`change ${path}`);
        if (this.path2cid[path]) delete this.cid2path[this.path2cid[path]];
        await mapToCID(path);
        update();
      });
      this.watcher.on('unlink', async (path) => {
        // console.warn(`del ${path}`);
        if (this.path2cid[path]) delete this.cid2path[this.path2cid[path]];
        delete this.path2cid[path];
        update();
      });
      this.watcher.on('ready', () => {
        // console.warn(`ready!`);
        this.eventing = true;
        resolve(this.cid2path);
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
