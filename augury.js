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
  .name('augury')
  .description('An experimental Nostr server that integrates with IPFS')
  .version(version)
  .option('-p, --port <number>', 'the port on which the WSS server runs', 6455)
  .argument('<path>', 'path to the directory in which the data is saved')
  .action(async (path, options) => {
    path = isAbsolute(path) ? path : join(cwd(), path);
  })
;
program.parse();
