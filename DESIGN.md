---
name: 渐知 · 纸白
description: 以学习内容为中心的本地学习工作台，A2 全站视觉基准。
colors:
  primary: "#55534E"
  background: "#F8F7F3"
  paper: "#FFFFFF"
  sidebar: "#FCFCFA"
  ink: "#302F2C"
  muted: "#68665F"
  line: "#DFDED7"
  selected: "#EAE5DA"
  inverse: "#FFFFFF"
  field: "#FBFAF7"
  danger: "#9B3F37"
  danger-soft: "#F8EDEB"
  success: "#376146"
  success-soft: "#ECF2E9"
  warning: "#805F2C"
  warning-soft: "#F6EFDF"
  dark-background: "#1E1E1B"
  dark-paper: "#282824"
  dark-sidebar: "#20201D"
  dark-ink: "#EFEDE5"
  dark-muted: "#BDBAB0"
  dark-line: "#494940"
  dark-primary: "#D8D3C4"
  dark-inverse: "#252521"
  dark-selected: "#3C3B33"
  dark-field: "#23231F"
typography:
  display:
    fontFamily: "Noto Serif SC, Songti SC, serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.6
  title:
    fontFamily: "Noto Serif SC, Songti SC, serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.6
  section:
    fontFamily: "Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: "Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.9
  label:
    fontFamily: "Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  caption:
    fontFamily: "Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  small: "4px"
  control: "8px"
  paper: "12px"
  pill: "21px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  paper: "28px"
  section: "32px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.inverse}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "12px 14px"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.muted}"
    width: "92px"
  paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "28px"
---

## Overview

**Creative North Star: "阅读居中，导航退后，下一步清楚。"**

A2「纸白」由用户于 2026-10-04 选定。纸白背景承接白色内容区，墨灰用于文字和主要操作，浅茶色表示当前选择。短标题保留宋体的阅读气质，长正文与控件采用清楚的中文无衬线字体。

本文从已确认的 Pen 变量、组件与全站稿提取，应用通过 `paper.css` 实现。交互与页面覆盖见 [全站设计说明](docs/redesign/full-site.md)，索引见 [manifest.json](docs/redesign/manifest.json)，运行验收见 [实现记录](docs/redesign/implementation.md)。示例主题、日期、回答和数据仅用于评审。

**Key Characteristics:**

- 92px 浅色全局导航，图标下保留可见文字。
- 当前学习内容与主要行动优先，辅助信息按需展开。
- 宋体短标题、无衬线正文、低饱和中性色。
- 颜色与明确文案共同表达状态。

## Colors

`primary` 用于主按钮；`ink` 用于正文；`muted` 用于辅助说明。`selected` 只表示选中或引用，不代表学习完成。`line` 是分组边界，不能独自传达焦点或错误。

语义色只用于对应结果，配合文字或图标。普通文本至少 4.5:1，大字至少 3:1。深色稿已有基础角色映射；深色语义反馈仍需实现时逐项验证，不直接套用浅色错误背景。

## Typography

宋体只用于短标题与当前问题。正文以 16–18px 为主，阅读行高约 1.9；辅助标签为 12–14px。代码使用等宽字体，不用等宽字体装饰普通界面。

运行时的紧凑字号包括 12px 元信息、18px 工具栏、19px 窄屏当前问题、23px 正文小标题、24px 专注标题、27–28px 窄屏页标题。这些是响应式阅读密度的明确例外，不另起一套视觉系统。字体使用本机中文字体与可靠回退，不依赖外部字体请求。

中文阅读栏按约 30–40 个汉字控制行长；混合英文材料以 65–75ch 为参考，实际以阅读栏和辅助面板共同的可用宽度决定。时间、计数和进度数字使用等宽数字。字体应在实现时提供可靠的本地资源与回退，避免正文等待外部字体才显示。

## Layout

1440px 桌面稿使用 92px 导航；常规页面主体内边距为 40px × 112px，内容宽约 1124px。实现采用居中最大宽度与流动边距，不能将 112px 硬套到所有屏幕。导师带学使用左右双栏：原文约 780px、导师约 500px，间距 20px，主体横向内边距 24px、纵向 16px；页头间距 12px，内容区内边距 20px。两栏独立滚动，章节和笔记通过页头控件按需展开。自主阅读收起导师区，纸面居中；引用提问时再打开辅助区。

1024px 带学稿使用 24px 横向边距，原文约 504px、导师 360px；阅读稿使用 32px 边距并收起辅助列。390px 稿采用单列与 60px 顶栏、22px 内容边距；带学顶部常驻原文摘要，可展开全文，返回时保留当前问题与草稿。全局导航、章节和笔记按需打开。具体断点在原型阶段根据内容宽度确定，不能仅因设备名字切换。

同组控件距离较近，不同任务之间留出明显间隔。长列表在各自区域滚动；代码块横向滚动，不能撑宽整页。实际点击范围至少 44px，图标本身可以更小。

## Elevation & Depth

静态稿以背景色、留白和细边界区分层级，没有装饰性投影。普通内容保持平面；弹层依靠遮罩与焦点范围明确层级。实现新增弹层投影时应集中定义，并验证深浅主题。

## Shapes

内容纸面使用 12px 圆角，输入和按钮使用 8px，引用局部使用 4px。筛选控件可以使用胶囊轮廓，不把每段正文都包成卡片。圆形章节序号表示真实学习顺序。

## Components

- **按钮**：主、次、危险三种变体；忙碌状态保留原宽度，避免文字替换造成跳动。危险操作有对象名称和确认结果。
- **选择器与模式开关**：主题、模型和筛选共用控件规则。模式切换只影响当前小节，选中状态与 hover 分开，键盘可见焦点不依赖颜色微变。
- **输入**：标签固定可见；错误紧邻对应字段。失败保留用户输入；禁用操作说明原因。
- **导航**：窄浅侧栏，设置位于底部；当前入口兼具浅茶背景和文字状态。“添加主题”放在侧栏底部、设置上方的低频操作组，与日常导航分开，打开独立创建页；该页内部切换从主题开始、导入材料、本地仓库。今日与书架页头可保留快捷入口。
- **反馈**：明确区分草稿已保留、保存中、已保存、保存失败。成功仅在服务确认后显示；停止请求后保留已收到内容。
- **阅读与辅助区**：正文按真实长章节组织在独立滚动视口中，不用弹性留白撑满纸面；16px 正文、约 1.75 行高与 12px 段间距作为学习工作区密度。带学保留完整原文；原文滚动和导师回复互不抢位置。窄屏展开全文后回到原问题；切换自主阅读是独立操作。主动回忆默认收起材料，查看后按提示辅助处理。收起辅助区不清空笔记与提问草稿。
- **专注阅读**：学习页右上角提供入口，收起全局导航、导师和页头模式栏；保留退出、章节、字号及阅读进度。正文居中、最大约 980px，避免无限延长行宽。退出后恢复原模式、阅读位置、导师位置与未提交回答，不结束请求、不自动学完。
- **交互补充规则**：主按钮 hover 可加深到 `ink`，次按钮 hover 使用 `field`；键盘焦点采用高对比实线与间距。选中文本使用 `selected` 与 `ink`，caret 使用 `ink`。这些是实现规则，静态稿不能证明实际行为。

## Do's and Don'ts

### Do:

- 保持全站的组件、状态词和操作位置一致。
- 保留当前小节的学习模式、草稿、位置和任务连续性。
- 把“学完本节”与主动回忆结果分别显示。
- 在学习主区域直接呈现当前任务与下一步。

### Don't:

- 不恢复大面积深色侧栏或醒目的侧栏宣传区。
- 不把 AI 示例主题与示例记录写进新安装的数据。
- 不用颜色、进度条或一次完成动作替代掌握证据。
- 不把 JSON 导出称为包含材料与练习的完整备份。
