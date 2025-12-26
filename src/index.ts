#!/usr/bin/env node

import { Command } from 'commander';
import { runEnumeration } from './scraper/orchestrator.js';
import { ProjectWriter } from './storage/writer.js';
import path from 'path';
import fs from 'fs/promises';

const program = new Command();

program
  .name('chatgpt-indexer')
  .description('Enumerate all ChatGPT Projects via browser automation')
  .version('1.0.0');

program
  .command('run')
  .description('Start project enumeration')
  .option('--headful', 'Force headful browser mode')
  .option('-o, --output <path>', 'Output file path', 'projects.json')
  .action(async (options) => {
    try {
      console.log('ChatGPT Project Indexer');
      console.log('='.repeat(40));

      await runEnumeration(
        {
          headful: options.headful,
          output: options.output,
        },
        console.log
      );

      process.exit(0);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current indexing status')
  .option('-o, --output <path>', 'Storage file path', 'projects.json')
  .action(async (options) => {
    try {
      const absolutePath = path.resolve(options.output);

      try {
        const data = await fs.readFile(absolutePath, 'utf-8');
        const storage = JSON.parse(data);

        console.log('ChatGPT Project Indexer - Status');
        console.log('='.repeat(40));
        console.log(`Storage file: ${absolutePath}`);
        console.log(`Last updated: ${storage.lastUpdatedAt}`);
        console.log(`Total projects: ${storage.projects?.length ?? 0}`);

        if (storage.projects?.length > 0) {
          console.log('\nRecent projects:');
          const recent = storage.projects
            .sort((a: { lastConfirmedAt: string }, b: { lastConfirmedAt: string }) =>
              b.lastConfirmedAt.localeCompare(a.lastConfirmedAt)
            )
            .slice(0, 5);

          for (const project of recent) {
            console.log(`  - ${project.title}`);
            console.log(`    ID: ${project.id}`);
            console.log(`    URL: https://chatgpt.com/g/${project.id}`);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log('No storage file found. Run "chatgpt-indexer run" first.');
        } else {
          throw error;
        }
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
