import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from 'playwright';
import { detectAuthState } from '../../src/auth/detector.js';
import { AuthState } from '../../src/types/index.js';

// Mock page factory
function createMockPage(url: string, options: {
  sidebarVisible?: boolean;
  loginIndicatorVisible?: boolean;
} = {}): Page {
  const mockLocator = {
    first: vi.fn().mockReturnThis(),
    waitFor: vi.fn(),
    isVisible: vi.fn(),
  };

  // Configure sidebar visibility
  if (options.sidebarVisible) {
    mockLocator.waitFor.mockResolvedValue(undefined);
  } else {
    mockLocator.waitFor.mockRejectedValue(new Error('Element not found'));
  }

  // Configure login indicator visibility
  mockLocator.isVisible.mockResolvedValue(options.loginIndicatorVisible ?? false);

  return {
    url: vi.fn().mockReturnValue(url),
    locator: vi.fn().mockReturnValue(mockLocator as unknown as Locator),
  } as unknown as Page;
}

describe('detectAuthState', () => {
  describe('login page detection', () => {
    it('returns LOGIN_REQUIRED for auth0.openai.com URL', async () => {
      const page = createMockPage('https://auth0.openai.com/u/login');
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });

    it('returns LOGIN_REQUIRED for /auth/login URL', async () => {
      const page = createMockPage('https://chatgpt.com/auth/login');
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });

    it('returns LOGIN_REQUIRED for login.openai.com URL', async () => {
      const page = createMockPage('https://login.openai.com/auth');
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });
  });

  describe('non-ChatGPT domain detection', () => {
    it('returns LOGIN_REQUIRED for non-ChatGPT domains', async () => {
      const page = createMockPage('https://google.com');
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });

    it('returns LOGIN_REQUIRED for OpenAI main site', async () => {
      const page = createMockPage('https://openai.com');
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });
  });

  describe('authenticated state detection', () => {
    it('returns AUTHENTICATED when sidebar is visible', async () => {
      const page = createMockPage('https://chatgpt.com', { sidebarVisible: true });
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.AUTHENTICATED);
    });

    it('returns AUTHENTICATED for chatgpt.com/c/ URL with sidebar', async () => {
      const page = createMockPage('https://chatgpt.com/c/123456', { sidebarVisible: true });
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.AUTHENTICATED);
    });
  });

  describe('login indicator detection', () => {
    it('returns LOGIN_REQUIRED when login indicator is visible', async () => {
      const page = createMockPage('https://chatgpt.com', {
        sidebarVisible: false,
        loginIndicatorVisible: true,
      });
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.LOGIN_REQUIRED);
    });
  });

  describe('unknown state', () => {
    it('returns UNKNOWN when on ChatGPT but no sidebar or login indicator', async () => {
      const page = createMockPage('https://chatgpt.com', {
        sidebarVisible: false,
        loginIndicatorVisible: false,
      });
      const result = await detectAuthState(page);
      expect(result).toBe(AuthState.UNKNOWN);
    });
  });
});

describe('AuthState enum', () => {
  it('has expected values', () => {
    expect(AuthState.AUTHENTICATED).toBe('authenticated');
    expect(AuthState.LOGIN_REQUIRED).toBe('login_required');
    expect(AuthState.SESSION_EXPIRED).toBe('session_expired');
    expect(AuthState.UNKNOWN).toBe('unknown');
  });
});
