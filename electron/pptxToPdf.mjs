// Turns a .pptx into a PDF with the program that really knows how to draw it — PowerPoint if it
// is installed (Windows, macOS), else LibreOffice — so an imported slide looks exactly like the
// original. Returns null when neither is available or the conversion fails.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args, timeout = 120000) =>
  new Promise((resolve) => execFile(cmd, args, { timeout, windowsHide: true }, (err) => resolve(!err)));

const exists = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };

async function viaPowerPoint(input, output) {
  if (process.platform === 'win32') {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    const script = `$ErrorActionPreference='Stop';$p=New-Object -ComObject PowerPoint.Application;`
      + `try{$d=$p.Presentations.Open(${q(input)},-1,0,0);$d.SaveAs(${q(output)},32);$d.Close()}finally{$p.Quit()}`;
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  }
  if (process.platform === 'darwin') {
    if (!exists('/Applications/Microsoft PowerPoint.app/Contents/Info.plist')) return false;
    const script = [
      'on run argv',
      'tell application "Microsoft PowerPoint"',
      'open POSIX file (item 1 of argv)',
      'save active presentation in (item 2 of argv) as save as PDF',
      'close active presentation saving no',
      'end tell',
      'end run',
    ];
    return run('osascript', [...script.flatMap((l) => ['-e', l]), input, output]);
  }
  return false;
}

function sofficeCandidates() {
  const list = ['soffice', 'libreoffice'];
  if (process.platform === 'darwin') list.unshift('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (base) list.unshift(path.join(base, 'LibreOffice', 'program', 'soffice.exe'));
    }
  }
  return list;
}

async function viaLibreOffice(input, dir) {
  for (const exe of sofficeCandidates()) {
    if (path.isAbsolute(exe) && !exists(exe)) continue;
    if (await run(exe, ['--headless', '--convert-to', 'pdf', '--outdir', dir, input], 180000)) return true;
  }
  return false;
}

/** @param {Uint8Array} bytes the .pptx @returns {Promise<Buffer | null>} the PDF */
export async function pptxToPdf(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freecast-pptx-'));
  try {
    const input = path.join(dir, 'deck.pptx');
    const output = path.join(dir, 'out', 'deck.pdf');
    fs.mkdirSync(path.dirname(output));
    fs.writeFileSync(input, bytes);
    if (!(await viaPowerPoint(input, output)) || !exists(output)) {
      if (!(await viaLibreOffice(input, path.dirname(output))) || !exists(output)) return null;
    }
    return fs.readFileSync(output);
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
