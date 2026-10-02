#!/bin/zsh -l
set -e
cd "${0:A:h}"
if ! command -v pnpm >/dev/null; then
  print '未找到 pnpm，请先安装 pnpm，再重新打开。'
  read '?按回车关闭'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  pnpm install --frozen-lockfile
fi
print '渐知启动后，请打开 http://127.0.0.1:5188'
pnpm dev
