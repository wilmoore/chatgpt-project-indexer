#!/usr/bin/env node

import { Command } from 'commander';
import { runEnumeration, runWatchMode } from './scraper/orchestrator.js';
import { ProjectWriter } from './storage/writer.js';
import {
  loginAndExport,
  exportFromPersistent,
  importToPersistent,
  checkAuthStatus,
} from './auth/storage-state.js';
import { hasExistingSession, hasImportedState } from './browser/context.js';
import { launchBrowser, navigateToChatGPT, closeBrowser } from './browser/manager.js';
import { createTouchMechanism, touchAllProjects } from './touch/index.js';
import { CONFIG } from './config/constants.js';
import { AuthState } from './types/index.js';
import { setLogLevel } from './utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

const program = new Command();

program
  .name('chatgpt-indexer')
  .description('Enumerate all ChatGPT Projects via browser automation')
  .version('1.5.0')
  .option('-v, --verbose', 'Enable verbose debug logging')
  .hook('preAction', () => {
    const opts = program.opts();
    if (opts.verbose) {
      setLogLevel('DEBUG');
    }
  });

program
  .command('run')
  .description('Start project enumeration')
  .option('--headful', 'Force headful browser mode')
  .option('-o, --output <path>', 'Output file path', 'projects.json')
  .option('--skip-auth-check', 'Skip pre-flight authentication check')
  .option('-w, --watch', 'Run continuously, re-scanning at intervals')
  .option(
    '-i, --interval <duration>',
    'Scan interval in watch mode (e.g., 15m, 1h, 30s)',
    CONFIG.WATCH.DEFAULT_INTERVAL
  )
  .action(async (options) => {
    try {
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

      if (options.watch) {
        // Watch mode: run continuously
        await runWatchMode(
          {
            headful: options.headful,
            output: options.output,
            watch: true,
            interval: options.interval,
          },
          console.log
        );
      } else {
        // Single run mode
        console.log('ChatGPT Project Indexer');
        console.log('='.repeat(40));

        await runEnumeration(
          {
            headful: options.headful,
            output: options.output,
          },
          console.log
        );
      }

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

        const pinnedCount = storage.projects?.filter((p: { pinned?: boolean }) => p.pinned).length ?? 0;

        console.log('ChatGPT Project Indexer - Status');
        console.log('='.repeat(40));
        console.log(`Storage file: ${absolutePath}`);
        console.log(`Last updated: ${storage.lastUpdatedAt}`);
        console.log(`Total projects: ${storage.projects?.length ?? 0}`);
        console.log(`Pinned projects: ${pinnedCount}`);

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

// Pin command group
const pin = program
  .command('pin')
  .description('Manage pinned projects (float to top of sidebar)');

pin
  .command('add <projectId>')
  .description('Pin a project to keep it at the top')
  .option('-o, --output <path>', 'Storage file path', 'projects.json')
  .action(async (projectId, options) => {
    try {
      const writer = new ProjectWriter(options.output);
      await writer.initialize();

      const project = writer.getProject(projectId);
      if (!project) {
        console.error(`Project not found: ${projectId}`);
        console.log('Run "chatgpt-indexer run" first to index your projects.');
        process.exit(1);
      }

      if (project.pinned) {
        console.log(`Project "${project.title}" is already pinned.`);
        process.exit(0);
      }

      writer.addProject({
        ...project,
        pinned: true,
        pinnedAt: new Date().toISOString(),
      });

      await writer.flush();
      console.log(`Pinned: ${project.title}`);
      console.log(`\nRun "chatgpt-indexer touch" to float pinned projects to top.`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

pin
  .command('remove <projectId>')
  .description('Unpin a project')
  .option('-o, --output <path>', 'Storage file path', 'projects.json')
  .action(async (projectId, options) => {
    try {
      const writer = new ProjectWriter(options.output);
      await writer.initialize();

      const project = writer.getProject(projectId);
      if (!project) {
        console.error(`Project not found: ${projectId}`);
        process.exit(1);
      }

      if (!project.pinned) {
        console.log(`Project "${project.title}" is not pinned.`);
        process.exit(0);
      }

      writer.addProject({
        ...project,
        pinned: false,
        pinnedAt: undefined,
      });

      await writer.flush();
      console.log(`Unpinned: ${project.title}`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

pin
  .command('list')
  .description('List all pinned projects')
  .option('-o, --output <path>', 'Storage file path', 'projects.json')
  .action(async (options) => {
    try {
      const writer = new ProjectWriter(options.output);
      await writer.initialize();

      const pinned = writer.getPinnedProjects();

      if (pinned.length === 0) {
        console.log('No pinned projects.');
        console.log('\nTo pin a project: chatgpt-indexer pin add <projectId>');
        process.exit(0);
      }

      console.log(`Pinned Projects (${pinned.length})`);
      console.log('='.repeat(40));

      for (const project of pinned) {
        console.log(`  ${project.title}`);
        console.log(`    ID: ${project.id}`);
        console.log(`    Pinned: ${project.pinnedAt}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('touch')
  .description('Touch all pinned projects to float them to top of sidebar')
  .option('-o, --output <path>', 'Storage file path', 'projects.json')
  .option('--headful', 'Force headful browser mode')
  .option('--dry-run', 'Show what would be touched without executing')
  .action(async (options) => {
    try {
      const writer = new ProjectWriter(options.output);
      await writer.initialize();

      const pinned = writer.getPinnedProjects();

      if (pinned.length === 0) {
        console.log('No pinned projects to touch.');
        process.exit(0);
      }

      console.log(`Found ${pinned.length} pinned project(s)`);

      if (options.dryRun) {
        console.log('\nDry run - would touch:');
        for (const project of pinned) {
          console.log(`  - ${project.title}`);
        }
        process.exit(0);
      }

      // Launch browser
      console.log('\nLaunching browser...');
      const { context, page } = await launchBrowser({
        forceHeadful: options.headful,
        onProgress: console.log,
      });

      try {
        // Navigate to ChatGPT (needed to establish session context)
        console.log('Navigating to ChatGPT...');
        await navigateToChatGPT(page);

        // Wait a moment for any auth redirects to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Create touch mechanism and execute
        const mechanism = createTouchMechanism('icon_color');

        console.log('\nTouching pinned projects...');
        const result = await touchAllProjects(
          page,
          pinned,
          mechanism,
          {},
          console.log
        );

        console.log('\n' + '='.repeat(40));
        console.log(`Touch complete: ${result.success}/${result.total} succeeded`);

        if (result.failed > 0) {
          console.log(`\nFailed projects:`);
          for (const r of result.results.filter((r) => !r.success)) {
            const project = pinned.find((p) => p.id === r.projectId);
            console.log(`  - ${project?.title ?? r.projectId}: ${r.error}`);
          }
        }
      } finally {
        await closeBrowser(context);
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
