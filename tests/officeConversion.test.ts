import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fake = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: fake.run }));
// @ts-expect-error Desktop ESM implementation is exercised with real temporary files.
import { pptToPptx } from '../electron/pptxToPdf.mjs';

describe('native legacy PowerPoint conversion', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const directories: string[] = [];
  const bytes = Buffer.from('PK\x03\x04editable OOXML');
  beforeEach(() => { fake.run.mockReset(); directories.length = 0; });
  afterEach(() => { Object.defineProperty(process, 'platform', platform); });
  const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value, configurable: true });

  it('uses PowerPoint Open XML format 24 on Windows, closes only the imported document, and removes temporary files', async () => {
    setPlatform('win32');
    fake.run.mockImplementation((command, args, _options, done) => {
      expect(command).toBe('powershell.exe');
      const script: string = args.at(-1);
      expect(script).toContain(',24)'); expect(script).not.toContain('$p.Quit');
      const input = /Presentations\.Open\('([^']+)'/.exec(script)![1];
      const output = /SaveAs\('([^']+)'/.exec(script)![1];
      expect(fs.readFileSync(input).toString()).toBe('binary PPT'); directories.push(path.dirname(input));
      fs.writeFileSync(output, bytes); done(null);
    });
    expect(await pptToPptx(Buffer.from('binary PPT'))).toEqual(bytes);
    expect(directories.every((dir) => !fs.existsSync(dir))).toBe(true);
  });
  it('uses a separate LibreOffice profile and requires an actual output file even when an executable exits successfully', async () => {
    setPlatform('linux');
    fake.run.mockImplementation((command, args, _options, done) => {
      expect(args[args.indexOf('--convert-to') + 1]).toBe('pptx');
      const profile = args.find((arg: string) => arg.startsWith('-env:UserInstallation='));
      expect(profile).toBeTruthy();
      const dir = path.dirname(fileURLToPath(profile.slice(profile.indexOf('=') + 1)));
      directories.push(dir);
      if (command === 'libreoffice') fs.writeFileSync(path.join(dir, 'out', 'deck.pptx'), bytes);
      done(null); // soffice succeeds but produces nothing: try the next executable.
    });
    expect(await pptToPptx(Buffer.from('binary PPT'))).toEqual(bytes);
    expect(fake.run.mock.calls.map((call) => call[0])).toEqual(['soffice', 'libreoffice']);
    expect(directories.every((dir) => !fs.existsSync(dir))).toBe(true);
  });
  it('returns null and cleans up when no office program can convert the file', async () => {
    setPlatform('linux');
    fake.run.mockImplementation((_command, args, _options, done) => {
      directories.push(path.dirname(args.at(-1))); done(new Error('not installed'));
    });
    expect(await pptToPptx(Buffer.from('binary PPT'))).toBeNull();
    expect(directories.every((dir) => !fs.existsSync(dir))).toBe(true);
  });
  it('rejects non-ZIP output rather than passing a PDF or error page to the editable importer', async () => {
    setPlatform('linux');
    fake.run.mockImplementation((_command, args, _options, done) => {
      const dir = args[args.indexOf('--outdir') + 1];
      directories.push(path.dirname(dir)); fs.writeFileSync(path.join(dir, 'deck.pptx'), '%PDF not OOXML'); done(null);
    });
    expect(await pptToPptx(Buffer.from('binary PPT'))).toBeNull();
    expect(directories.every((dir) => !fs.existsSync(dir))).toBe(true);
  });
});
