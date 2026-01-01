import path from 'path';
import os from 'os';

/** Base directory for all chatgpt-indexer data */
const BASE_DIR = path.join(os.homedir(), '.chatgpt-indexer');

/**
 * Application configuration constants
 */
export const CONFIG = {
  /** ChatGPT base URL */
  CHATGPT_URL: 'https://chatgpt.com',

  /** Base directory for all application data */
  BASE_DIR,

  /** User data directory for persistent browser session */
  USER_DATA_DIR: path.join(BASE_DIR, 'browser-data'),

  /** Authentication state file paths */
  AUTH: {
    /** Default path for exported auth state (portable) */
    STATE_FILE: path.join(BASE_DIR, 'auth-state.json'),
    /** Path for imported state (consumed on next launch) */
    IMPORTED_FILE: path.join(BASE_DIR, 'imported-state.json'),
  },

  /** Default output file for project data */
  DEFAULT_OUTPUT_FILE: 'projects.json',

  /** Timeouts in milliseconds */
  TIMEOUTS: {
    PAGE_LOAD: 30_000,
    ELEMENT_WAIT: 5_000,
    TOOLTIP_APPEAR: 2_000,
    AUTH_RECOVERY: 300_000, // 5 minutes
    AUTH_POLL_INTERVAL: 2_000,
  },

  /** Delays between actions in milliseconds */
  DELAYS: {
    BETWEEN_HOVERS: 100,
    AFTER_SCROLL: 1000, // Increased for lazy loading
    MENU_ANIMATION: 500,
  },

  /** Scroll configuration */
  SCROLL: {
    DELTA_Y: 400, // Larger scroll increment
    /** Number of stable iterations to consider scroll exhausted */
    STABILITY_THRESHOLD: 5, // More iterations before declaring done
  },

  /** Storage configuration */
  STORAGE: {
    /** Interval between flushes to disk */
    FLUSH_INTERVAL: 5_000,
    /** Number of completed runs to keep (for cleanup) */
    KEEP_RUNS: 3,
  },

  /** Supabase configuration */
  SUPABASE: {
    /** Supabase project URL (from env or default to local) */
    URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
    /** Supabase anon/publishable key (from env or default to local) */
    ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    /** Table name for projects */
    TABLE_NAME: 'projects',
    /** Table name for runs */
    RUNS_TABLE: 'runs',
  },

  /** Browser viewport dimensions */
  VIEWPORT: {
    WIDTH: 1280,
    HEIGHT: 800,
  },
} as const;

/**
 * DOM selectors with fallback chains
 * ChatGPT DOM is undocumented, so we use multiple strategies
 */
export const SELECTORS = {
  /** Sidebar container selectors */
  sidebar: [
    '[data-testid="sidebar"]',
    '#sidebar',
    'nav[aria-label*="Chat"]',
    'nav',
  ],

  /** Projects section link/button */
  projectsLink: [
    'text="Projects"',
    '[data-testid="projects-link"]',
    'a[href*="projects"]',
  ],

  /** "See more" expansion button */
  seeMore: [
    'text="See more"',
    'button:has-text("See more")',
    '[data-testid="see-more"]',
  ],

  /** Scrollable projects container */
  projectsContainer: [
    '[data-testid="projects-list"]',
    '[role="list"]',
    '.projects-container',
  ],

  /** Individual project item - Projects have /g/g-p-{id}/project URLs */
  projectItem: [
    'a[href$="/project"]',
    'a[href*="g-p-"][href*="/project"]',
  ],

  /** Tooltip element */
  tooltip: [
    '[role="tooltip"]',
    '.tooltip',
    '[data-radix-popper-content-wrapper]',
  ],

  /** Auth detection - login page indicators */
  loginIndicators: [
    'text="Log in"',
    'text="Sign up"',
    'text="Welcome back"',
    'text="Get started"',
    '[data-testid="login-button"]',
    'button:has-text("Log in")',
    'button:has-text("Sign up")',
    'a:has-text("Log in")',
  ],
} as const;

/**
 * URL patterns for auth detection
 */
export const AUTH_URL_PATTERNS = {
  LOGIN: ['auth0.openai.com', '/auth/login', 'login.openai.com'],
  AUTHENTICATED: ['chatgpt.com'],
} as const;
