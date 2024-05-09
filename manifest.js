
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import mime from 'mime-types';
import { CID } from 'multiformats/cid';
import Watcher from './watcher.js';
import { fromDataWithData } from './cid.js';


// Manifest:
// {
//   name
//   description
//   icons
//   resources: {
//     '/': {} // this one is a *copy* of the one for index.html
//     '/path/to/something': {
//       src: 'cid',
//       mediaType: 'text/html',
//     },
//   },
// }

export default class Manifest extends EventEmitter {
  constructor (path, meta = {}) {
    super();
    this.path = path; // should be absolute
    this.watcher = new Watcher(path);
    this.resources = {};
    this.meta = meta; // name, description, icons (though those must be resources too)
  }
  async map2manifest (map) {
    Object.entries(map).forEach(([cid, path]) => this.addToResourceMap(path, cid));
  }
  addToResourceMap (path, cid) {
    const mediaType = mime.lookup(join(this.path, path));
    if (!/^\//.test(path)) path = `/${path}`;
    this.resources[path] = { src: cid, mediaType };
    // if the file is index.html at the root, we add a second / entry for that
    if (path === '/index.html') this.resources['/'] = Object.assign({}, this.resources[path]);
  }
  async generate () {
    this.map2manifest(await this.watcher.run());
    this.watcher.stop();
    return this.manifest();
  }
  async watch () {
    // console.warn(`[📃] Calling awaited watcher.run`);
    this.map2manifest(await this.watcher.run());
    // console.warn(`[📃] After resolution of watcher.run, adding event listener`);
    this.watcher.on('update', (map, type, cid, path) => {
      // console.warn(`[📃] ••• update! ${path}`);
      if (type === 'add' || type === 'change') this.addToResourceMap(path, cid);
      else if (type === 'delete') {
        if (!/^\//.test(path)) path = `/${path}`;
        delete this.resources[path];
      }
      else console.error(`Unknown change type ${type}`);
      this.emit('update', this.manifest());
    });
  }
  async stop () {
    await this.watcher?.stop();
  }
  manifest () {
    const m = {
      name: this.meta?.name || 'Unnamed Tile',
      description: this.meta?.description || null,
      // XXX to support icons, need to check that they are resources
      // icons: this.meta?.icons,
    };
    m.resources = Object.assign({}, this.resources);
    Object.values(m.resources).forEach(r => {
      if (typeof r.src === 'string') r.src = CID.parse(r.src);
    });
    return m;
  }
  async tile () {
    const m = this.manifest();
    const [cid, tile] = await fromDataWithData(m);
    return {
      cid,
      tile,
      url: `web+tile://${cid}/`,
    };
  }
}
