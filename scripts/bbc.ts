/** `bbc` — Bangkok Bus Check data tooling. Run via `npm run bbc -- <command>`. */

import { Command, Option } from 'commander';

import { buildData, DEFAULT_OUTPUT_DIR } from './build-data.ts';
import { fetchRaw, type RawSource } from './fetch-raw.ts';

const program = new Command('bbc').description('Bangkok Bus Check data tooling');

program
  .command('fetch-raw')
  .description('download source snapshots into data/raw/')
  .addOption(new Option('-s, --source <name>', 'fetch only one source').choices(['wikipedia', 'osm']))
  .action(async (options: { source?: RawSource }) => {
    await fetchRaw(options.source ? [options.source] : ['wikipedia', 'osm']);
  });

program
  .command('build-data')
  .description('compile data/raw/ into the app dataset')
  .option('-o, --out <dir>', 'output directory', DEFAULT_OUTPUT_DIR)
  .option('-v, --verbose', 'list skipped rows and merge decisions', false)
  .action(async (options: { out: string; verbose: boolean }) => {
    await buildData(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
