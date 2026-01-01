#!/usr/bin/env node

import { Command } from 'commander';
import { runEnumeration } from './scraper/orchestrator.js';
import { ProjectWriter } from './storage/writer.js';
import {
  loginAndExport,
  exportFromPersistent,
  importToPersistent,
  checkAuthStatus,
} from './auth/storage-state.js';
import { hasExistingSession, hasImportedState } from './browser/context.js';
import { CONFIG } from './config/constants.js';
import { AuthState } from './types/index.js';
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
  .option('--skip-auth-check', 'Skip pre-flight authentication check')
  .action(async (options) => {
    try {
      console.log('ChatGPT Project Indexer');
      console.log('='.repeat(40));

      // Pre-flight auth check (unless skipped)
      if (!options.skipAuthCheck) {
        const hasSession = await hasExistingSession();
        const hasImported = await hasImportedState();

        if (!hasSession && !hasImported) {
          console.log('No existing session found.');
          console.log('');
          console.log('For headless/remote operation, authenticate first:');
          console.log('  chatgpt-indexer auth login');
          console.log('');
          console.log('Or continue with browser login (will open headful browser).');
          console.log('');
        } else if (hasImported) {
          console.log('Imported session found - will apply on launch.');
        } else {
          console.log('Using existing session.');
        }
      }

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

// Auth command group
const auth = program
  .command('auth')
  .description('Manage authentication for headless/remote operation');

auth
  .command('login')
  .description('Authenticate interactively (opens browser)')
  .option('-o, --output <path>', 'Output file path', CONFIG.AUTH.STATE_FILE)
  .action(async (options) => {
    try {
      console.log('ChatGPT Project Indexer - Authentication');
      console.log('='.repeat(40));

      await loginAndExport(options.output, console.log);

      console.log('\nAuthentication complete!');
      console.log('You can now run "chatgpt-indexer run" to start enumeration.');
      console.log(
        `\nTo use on a remote server, transfer the auth file:\n  scp ${options.output} remote-server:~/.chatgpt-indexer/\n  ssh remote-server "chatgpt-indexer auth import ~/.chatgpt-indexer/auth-state.json"`
      );

      process.exit(0);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

auth
  .command('export')
  .description('Export current session to portable file')
  .option('-o, --output <path>', 'Output file path', CONFIG.AUTH.STATE_FILE)
  .action(async (options) => {
    try {
      console.log('ChatGPT Project Indexer - Export Session');
      console.log('='.repeat(40));

      await exportFromPersistent(options.output, console.log);

      console.log('\nExport complete!');

      process.exit(0);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

auth
  .command('import')
  .description('Import session from portable file (for headless servers)')
  .argument('<file>', 'Path to auth state file')
  .action(async (file) => {
    try {
      console.log('ChatGPT Project Indexer - Import Session');
      console.log('='.repeat(40));

      await importToPersistent(file, console.log);

      console.log('\nImport complete!');
      console.log('Run "chatgpt-indexer run" to start enumeration with the imported session.');

      process.exit(0);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

auth
  .command('status')
  .description('Check current authentication status')
  .action(async () => {
    try {
      console.log('ChatGPT Project Indexer - Auth Status');
      console.log('='.repeat(40));

      const authState = await checkAuthStatus(console.log);

      if (authState !== AuthState.AUTHENTICATED) {
        console.log('\nTo authenticate, run: chatgpt-indexer auth login');
      }

      process.exit(authState === AuthState.AUTHENTICATED ? 0 : 1);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
