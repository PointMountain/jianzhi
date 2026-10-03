# Domain Docs

本仓库采用 single-context 布局。本文规定工程技能探索代码时如何读取领域文档。

## Before exploring, read these

- 根目录 `GLOSSARY.md`：阅读已有领域术语。
- `docs/adr/`：阅读与当前工作相关的架构决策记录。

文件或目录不存在时，静默继续，不将其视为阻塞项，也不主动建议提前创建。
`/domain-modeling` 在术语或决策明确后按需创建这些文档；
该技能也可能由 `/grill-with-docs` 或 `/improve-codebase-architecture` 调用。

## File structure

- `GLOSSARY.md`：全仓库共用的领域术语表。
- `docs/adr/NNNN-<decision>.md`：按编号保存架构决策记录。

## Use the glossary's vocabulary

在 issue 标题、重构提案、假设、测试名称等输出中，
使用 `GLOSSARY.md` 定义的术语，避免使用它明确排除的同义词。

需要的概念尚未收录时，先检查是否引入了项目不使用的说法；
确有缺口时，记录为 `/domain-modeling` 的输入。

## Flag ADR conflicts

方案与已有 ADR 冲突时，明确指出对应 ADR、冲突内容和重新讨论的理由，
不要静默覆盖已有决策。
