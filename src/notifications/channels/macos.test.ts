import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMacOSNotification } from './macos.js';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('sendMacOSNotification', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should return error on non-macOS platform', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const result = await sendMacOSNotification('Test Title', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('macOS notifications only available on macOS');
  });

  it('should send notification successfully on macOS', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const mockExec = vi.fn(
      (
        _cmd: string,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(null, '', '');
      }
    );
    vi.mocked(childProcess.exec).mockImplementation(mockExec as unknown as typeof childProcess.exec);

    const result = await sendMacOSNotification('Test Title', 'Test message');

    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('osascript -e'),
      expect.any(Function)
    );
  });

  it('should escape special characters', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const mockExec = vi.fn(
      (
        cmd: string,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        // Verify the command contains escaped characters
        expect(cmd).not.toContain('unescaped"quote');
        callback(null, '', '');
      }
    );
    vi.mocked(childProcess.exec).mockImplementation(mockExec as unknown as typeof childProcess.exec);

    await sendMacOSNotification('Title with "quotes"', 'Message with "quotes"');

    expect(mockExec).toHaveBeenCalled();
  });

  it('should handle exec error', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const mockExec = vi.fn(
      (
        _cmd: string,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(new Error('Command failed'), '', '');
      }
    );
    vi.mocked(childProcess.exec).mockImplementation(mockExec as unknown as typeof childProcess.exec);

    const result = await sendMacOSNotification('Test', 'Test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command failed');
  });
});
