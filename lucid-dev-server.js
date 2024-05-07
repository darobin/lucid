#!/usr/bin/env node

import { cwd } from "node:process";
import { isAbsolute, join } from "node:path";
import { readFile } from "node:fs/promises";
import { program } from 'commander';
import makeRel from './lib/rel.js';
import { devServer } from "./server.js";

const rel = makeRel(import.meta.url);
const { version } = JSON.parse(await readFile(rel('./package.json')));

program
  .name('lucid-dev-server')
  .description('Run a dev server for Web Tiles')
  .version(version)
  .option('-p, --port', 'port', 3210)
  .argument('<path>', 'path to the directory to serve')
  .action((path, options) => {
    path = isAbsolute(path) ? path : join(cwd(), path);
    devServer(path, options);
  })
;
program.parse();
