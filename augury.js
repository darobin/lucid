#!/usr/bin/env node

import { cwd } from "node:process";
import { isAbsolute, join } from "node:path";
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
  .argument('[store]', 'path to the directory in which the data is saved')
  .action(async (store, options) => {
    let cfg = {};
    if (options.config) {
      const cfgFile = isAbsolute(options.config) ? options.config : join(cwd(), options.config);
      cfg = JSON.parse(await readFile(cfgFile));
    }
    // CLI overrides config
    if (options.port) cfg.port = options.port;
    if (store) cfg.store = store;
    if (!cfg.store) throw new Error(`A store path must be given either in the configuration or as argument.`);
    cfg.store = isAbsolute(cfg.store) ? cfg.store : join(cwd(), cfg.store);

    const n = new InterplanetaryNostrum(cfg);
    console.warn(`Augury running at wss://localhost:${cfg.port}/.`);
    await n.run();
  })
;
program.parse();
