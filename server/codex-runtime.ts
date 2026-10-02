import fs from 'node:fs';

export function codexRuntime(): { executable: string; source: string } {
  if (process.env.STUDY_CODEX_BIN)
    return { executable: process.env.STUDY_CODEX_BIN, source: '指定的 Codex CLI' };
  // Reuse the already-installed desktop runtime and its current model catalog.
  if (process.platform === 'darwin') {
    for (const executable of [
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
    ]) {
      try {
        fs.accessSync(executable, fs.constants.X_OK);
        return { executable, source: '桌面应用内置 Codex' };
      } catch {
        /* try PATH below */
      }
    }
  }
  return { executable: 'codex', source: '终端 PATH 中的 Codex' };
}
