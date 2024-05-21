#!/usr/bin/env node

import { cwd, exit } from "node:process";
import { isAbsolute, join, dirname, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { program } from 'commander';
import Manifest from "./manifest.js";
import makeRel from './lib/rel.js';

const rel = makeRel(import.meta.url);
const { version } = JSON.parse(await readFile(rel('./package.json')));

program
  .name('caddify')
  .description('Dynamically configure a Caddy server to serve IPFS')
  .version(version)
  .option('-e, --endpoint <url>', 'the Caddy endpoint for its configuration API', 'http://localhost:2019/')
  .option('-d, --domain <domain>', 'the domain under which to serve IPFS', 'localhost')
  .option('-p, --port <number>', 'the port from which to serve IPFS', 443)
  .option('-o, --out <path>', 'path to save the config to instead of posting it')
  .option('-q, --quiet', 'shush', false)
  .argument('<path>', 'path to the directory to serve')
  .action(async (path, options) => {
    path = isAbsolute(path) ? path : join(cwd(), path);
    const m = new Manifest(path);
    const { resources } = await m.generate();
    const domain = options.domain.replace(/^\.+/, '');
    const reportMap = [];
    const doc = {
      listen: [`:${options.port}`],
      routes: Object.entries(resources).map(([subpath, { src, mediaType }]) => {
        if (!subpath || subpath === '/') return;
        const fullPath = join(path, subpath);
        const root = dirname(fullPath);
        const file = basename(fullPath);
        const fullDomain = `${src}.ipfs.${domain}`;
        reportMap.push(`- https://${fullDomain}${options.port === 443 ? '' : `:${options.port}`}/ ➯ ${subpath}`);
        return {
          '@id': `caddify-${src}`,
          handle: [
            // this doesn't work with pathing, so not supporting it for now
            {
              handler: 'rewrite',
              path_regexp: [{ find: '.*', replace: '/' }],
            },
            // force the media type
            {
              handler: 'headers',
              response: { set: { "Content-Type": [mediaType] } },
            },
            // no pathing, a root, and the file as index
            {
              handler: 'file_server',
              root,
              index_names: [file],
            },
          ],
          match: [{
            host: [fullDomain],
          }],
          terminal: true,
        };
      }).filter(Boolean),
    };
    if (options.out) {
      const outFile = isAbsolute(options.out) ? options.out : join(cwd(), options.out);
      await writeFile(outFile, JSON.stringify(doc, null, 2));
    }
    else {
      // first, remove all the @id that start with caddify-
      const endpoint = options.endpoint.replace(/\/+$/, '');
      const get = await fetch(`${endpoint}/config/apps/http/servers/https/routes`);
      await checkError('failed to get current Caddy configuration', get, options);
      const currentIDs = (await get.json()).map(({ '@id': id }) => id).filter(id => !!id && /^caddify-/.test(id));
      await Promise.all(
        currentIDs.map(id => fetch(`${endpoint}/id/${id}`, { method: 'delete' }))
      );

      const res = await fetch(`${endpoint}/config/apps/http/servers/https`, {
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      await checkError('failed to post configuration to Caddy', res, options);
      if (!options.quiet) {
        console.log(`Configuration updated:`);
        console.log(reportMap.join('\n'));
      }
    }
  })
;
program.parse();

async function checkError (msg, res, options) {
  if (res.status >= 400) {
    if (!options.quiet) {
      console.warn(`Error (${res.statusText}): ${msg}`);
      console.warn(await res.text());
    }
    exit(1);
  }
}
