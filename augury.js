#!/usr/bin/env node

import { cwd } from "node:process";
import { isAbsolute, join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { program } from 'commander';
import InterplanetaryNostrum from "./nostr.js";
import makeRel from './lib/rel.js';

const rel = makeRel(import.meta.url);
const { version } = JSON.parse(await readFile(rel('./package.json')));

program
  .name('augury')
  .description('An experimental Nostr server that integrates with IPFS')
  .version(version)
  .option('-p, --port <number>', 'the port on which the WSS server runs', 6455)
  .option('-c, --config <path>', 'a configuration file')
  .option('-s, --store', 'path to the directory in which the data is saved')
  .action(async (options) => {
    let cfg = {};
    let cfgFile;
    if (options.config) {
      cfgFile = absolutise(options.config);
      cfg = JSON.parse(await readFile(cfgFile));
    }
    // CLI overrides config
    if (options.port) cfg.port = options.port;
    if (options.store) cfg.store = absolutise(options.store);
    else if (cfgFile && cfg.store) cfg.store = absolutise(cfg.store, dirname(cfgFile));
    if (!cfg.store) throw new Error(`A store path must be given either in the configuration or as argument.`);

    const n = new InterplanetaryNostrum(cfg);
    console.warn(`Augury running at wss://localhost:${cfg.port}/.`);
    await n.run();
  })
;
program.parse();

function absolutise (pth, relTo = cwd()) {
  return isAbsolute(pth) ? pth : join(relTo, pth);
}
