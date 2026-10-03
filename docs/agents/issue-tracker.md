# Issue tracker: GitHub

本仓库的问题与规格记录在 PointMountain/jianzhi 的 GitHub Issues。
使用 `gh` CLI 操作。

## Conventions

在仓库目录运行命令，`gh` 会根据 Git remote 推断目标仓库。
在其他目录运行时，显式传入 `--repo PointMountain/jianzhi`。

- 创建：`gh issue create --title "..." --body-file <file>`
- 阅读正文、评论与标签：`gh issue view <number> --json number,title,body,labels,comments`
- 列出待处理问题：`gh issue list --state open --json number,title,body,labels,comments`
- 按标签筛选：为列表命令追加 `--label "<label>"`
- 评论：`gh issue comment <number> --body-file <file>`
- 添加标签：`gh issue edit <number> --add-label "<label>"`
- 移除标签：`gh issue edit <number> --remove-label "<label>"`
- 关闭：`gh issue close <number>`

多行正文和评论先写入临时文件，再用 `--body-file` 提交，保留实际换行。
分诊标签使用 `docs/agents/triage-labels.md` 的映射。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

创建 GitHub issue。

## When a skill says "fetch the relevant ticket"

运行 `gh issue view <number> --comments`；需要标签时使用上面的 JSON 查询。

## Wayfinding operations

供 `/wayfinder` 使用：一个 map issue 管理多个 child issues。

- Map：使用 `wayfinder:map` 标签；正文包含 Notes、Decisions-so-far 和 Fog。
- Child ticket：通过 `gh api` 建立 GitHub sub-issue 关系。
  若该能力不可用，在 map 正文维护任务列表，并在 child 正文顶部写 `Part of #<map>`。
  类型标签为 `wayfinder:research`、`wayfinder:prototype`、
  `wayfinder:grilling` 或 `wayfinder:task`。
- Blocking：优先使用 GitHub 原生 issue dependencies。
  API 中需要 issue ID 时使用数据库 ID，而非 issue 编号或 node_id。
  若该能力不可用，在 child 正文顶部写 `Blocked by: #<n>, #<n>`。
  所有阻塞项均关闭后，该 ticket 才可推进。
- Frontier query：按 map 顺序查看尚未关闭的 children，
  排除仍有未关闭阻塞项或已有 assignee 的 ticket，选取第一个。
  原生依赖可使用 `issue_dependencies_summary.blocked_by` 判断未关闭阻塞项。
- Claim：`gh issue edit <number> --add-assignee @me`，
  作为认领该 ticket 的首次写操作。
- Resolve：评论记录结论、关闭 ticket，
  再向 map 的 Decisions-so-far 补充决策摘要与上下文链接。
