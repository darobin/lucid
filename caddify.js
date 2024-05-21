#!/usr/bin/env node

import { cwd, exit } from "node:process";
import { isAbsolute, join, dirname, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { program } from 'commander';
import Manifest from "./manifest.js";
import makeRel from './lib/rel.js';

const rel = makeRel(import.meta.url);
const { version } = JSON.parse(await readFile(rel('./package.json')));

// - caddy endpoint
// - domain
// - save configuration


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
    // - get a full map of the directory, as a manifest
    // - convert that to configuration that maps a subdomain to the file, with the media type set
    // - either save where told or update the caddy configuration
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

// {
//   "apps": {
//     "http": {
//       "servers": {
//         "https": {
//           "listen": [
//             ":443"
//           ],
//           "routes": [
//             {
//               "handle": [
//                 {
//                   "handler": "subroute",
//                   "routes": [
//                     {
//                       "handle": [
//                         {
//                           "handler": "headers",
//                           "response": {
//                             "set": {
//                               "Permissions-Policy": [
//                                 "interest-cohort=(), browsing-topics=()"
//                               ],
//                               "Referrer-Policy": [
//                                 "origin-when-cross-origin"
//                               ],
//                               "Strict-Transport-Security": [
//                                 "max-age=63072000; preload"
//                               ],
//                               "Tk": [
//                                 "N"
//                               ],
//                               "X-Content-Type-Options": [
//                                 "nosniff"
//                               ],
//                               "X-Frame-Options": [
//                                 "sameorigin"
//                               ],
//                               "X-Robots-Tag": [
//                                 "noai, noimageai"
//                               ]
//                             }
//                           }
//                         },
//                         {
//                           "handler": "reverse_proxy",
//                           "upstreams": [
//                             {
//                               "dial": "stats.berjon.bast:3080"
//                             }
//                           ]
//                         }
//                       ]
//                     }
//                   ]
//                 }
//               ],
//               "match": [
//                 {
//                   "host": [
//                     "stats.berjon.bast"
//                   ]
//                 }
//               ],
//               "terminal": true
//             },
//             {
//               "handle": [
//                 {
//                   "handler": "subroute",
//                   "routes": [
//                     {
//                       "handle": [
//                         {
//                           "handler": "headers",
//                           "response": {
//                             "set": {
//                               "Permissions-Policy": [
//                                 "interest-cohort=(), browsing-topics=()"
//                               ],
//                               "Referrer-Policy": [
//                                 "origin-when-cross-origin"
//                               ],
//                               "Strict-Transport-Security": [
//                                 "max-age=63072000; preload"
//                               ],
//                               "Tk": [
//                                 "N"
//                               ],
//                               "X-Content-Type-Options": [
//                                 "nosniff"
//                               ],
//                               "X-Frame-Options": [
//                                 "sameorigin"
//                               ],
//                               "X-Robots-Tag": [
//                                 "noai, noimageai"
//                               ]
//                             }
//                           }
//                         },
//                         {
//                           "handler": "reverse_proxy",
//                           "upstreams": [
//                             {
//                               "dial": "cv.berjon.bast:3080"
//                             }
//                           ]
//                         }
//                       ]
//                     }
//                   ]
//                 }
//               ],
//               "match": [
//                 {
//                   "host": [
//                     "cv.berjon.bast"
//                   ]
//                 }
//               ],
//               "terminal": true
//             },
//             {
//               "handle": [
//                 {
//                   "handler": "subroute",
//                   "routes": [
//                     {
//                       "handle": [
//                         {
//                           "handler": "headers",
//                           "response": {
//                             "set": {
//                               "Permissions-Policy": [
//                                 "interest-cohort=(), browsing-topics=()"
//                               ],
//                               "Referrer-Policy": [
//                                 "origin-when-cross-origin"
//                               ],
//                               "Strict-Transport-Security": [
//                                 "max-age=63072000; preload"
//                               ],
//                               "Tk": [
//                                 "N"
//                               ],
//                               "X-Content-Type-Options": [
//                                 "nosniff"
//                               ],
//                               "X-Frame-Options": [
//                                 "sameorigin"
//                               ],
//                               "X-Robots-Tag": [
//                                 "noai, noimageai"
//                               ]
//                             }
//                           }
//                         },
//                         {
//                           "handler": "reverse_proxy",
//                           "upstreams": [
//                             {
//                               "dial": "localhost:9999"
//                             }
//                           ]
//                         }
//                       ]
//                     }
//                   ]
//                 }
//               ],
//               "match": [
//                 {
//                   "host": [
//                     "igneous.bast"
//                   ]
//                 }
//               ],
//               "terminal": true
//             },
//             {
//               "handle": [
//                 {
//                   "handler": "subroute",
//                   "routes": [
//                     {
//                       "handle": [
//                         {
//                           "handler": "headers",
//                           "response": {
//                             "set": {
//                               "Permissions-Policy": [
//                                 "interest-cohort=(), browsing-topics=()"
//                               ],
//                               "Referrer-Policy": [
//                                 "origin-when-cross-origin"
//                               ],
//                               "Strict-Transport-Security": [
//                                 "max-age=63072000; preload"
//                               ],
//                               "Tk": [
//                                 "N"
//                               ],
//                               "X-Content-Type-Options": [
//                                 "nosniff"
//                               ],
//                               "X-Frame-Options": [
//                                 "sameorigin"
//                               ],
//                               "X-Robots-Tag": [
//                                 "noai, noimageai"
//                               ]
//                             }
//                           }
//                         },
//                         {
//                           "handler": "reverse_proxy",
//                           "upstreams": [
//                             {
//                               "dial": "berjon.bast:3080"
//                             }
//                           ]
//                         }
//                       ]
//                     }
//                   ]
//                 }
//               ],
//               "match": [
//                 {
//                   "host": [
//                     "berjon.bast"
//                   ]
//                 }
//               ],
//               "terminal": true
//             }
//           ]
//         }
//       }
//     },
//     "tls": {
//       "automation": {
//         "policies": [
//           {
//             "issuers": [
//               {
//                 "module": "internal"
//               }
//             ],
//             "subjects": [
//               "stats.berjon.bast",
//               "cv.berjon.bast",
//               "igneous.bast",
//               "berjon.bast"
//             ]
//           }
//         ]
//       }
//     }
//   },
//   "logging": {
//     "logs": {
//       "default": {
//         "writer": {
//           "filename": "/Users/robin/Code/darobin/caddy-files/caddy.log",
//           "output": "file"
//         }
//       }
//     }
//   }
// }
