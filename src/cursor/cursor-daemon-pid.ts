import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';

function getCursorDir(): string {
  return path.join(getCcsDir(), 'cursor');
}

function getPidFilePath(): string {
  return path.join(getCursorDir(), 'daemon.pid');
}

export function getPidFromFile(): number | null {
  const pidFile = getPidFilePath();
  try {
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, 'utf8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function writePidToFile(pid: number): void {
  const pidFile = getPidFilePath();
  try {
    const dir = path.dirname(pidFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(pidFile, pid.toString(), { mode: 0o600 });
  } catch {
    // Ignore errors
  }
}

export function removePidFile(): void {
  const pidFile = getPidFilePath();
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // Ignore errors
  }
}
