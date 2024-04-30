#!/usr/bin/env node

import { cwd } from "node:process";
import { isAbsolute, join } from "node:path";
import { readFile } from "node:fs/promises";
import { program } from 'commander';
import express from 'express';
import makeRel from './lib/rel.js';

const rel = makeRel(import.meta.url);
const { version } = JSON.parse(await readFile(rel('./package.json')));

program
  .name('lucid-dev-server')
  .description('Run a dev server for Web Tiles')
  .version(version)
  // .requiredOption('--gateway <url>', 'root URL of the gateway to test, eg. http://127.0.0.1:8765/')
  // .option('--save <label>', 'whether to save the output and if so which implementation to label that with', false)
  // .option('--markdown <outputFile>', 'save a Markdown output to that file')
  .option('-p, --port', 'port', 3210)
  .argument('<path>', 'path to the directory to serve')
  .action((path, options) => {
    path = isAbsolute(path) ? path : join(cwd(), path);
    const app = express();
    app.use(express.static(rel('dev-server')));

    // - event source
    // - watch the dir
    // - mount the router generator, and remount when there's a change

    app.listen(options.port, () => {
      console.warn(`Lucid serving tiles from '${path}' at http://localhost:${options.port}/.`);
    });
  })
;
program.parse();
