# Herdr Personal

从当前 Herdr T3 界面建立的个人配置仓库。布局、主题和 7 个面板使用独立名称，后续可在这里修改并通过 Git 保存每一版。

当前界面：Herdr 0.1.12，T3 作者配色，侧栏仅显示 Spaces。每个项目右侧按状态显示 Agent 图标和数量：橙色 `!` 需要处理、蓝色旋转图标运行中、实心点已完成、空心点空闲。活跃子 Agent 的紧急状态会反映在父 Agent 上，没有 Agent 的项目不显示状态。

状态计数旁显示 Space 内的 Agent 类型图标（如 Claude Code、Codex）；Codex 使用无背景、跟随界面文字颜色的 ChatGPT 标志。同类型跨标签只显示一个图标，多种类型并排显示。没有 Agent 时不显示图标，也不预留位置。图标跟随 Agent 的启动、退出和类型变化更新。

顶部标签栏、终端窗格标题栏和单 Agent 视图的标题栏中，Codex 同样使用无背景的 ChatGPT 标志；各程序图标在相同尺寸的容器中居中显示。

每个 Space 基础行高 50px；repo/worktree 名称在上，Git 分支及领先/落后提交数在下。无 Git 信息的项目仅显示名称，Agent 状态固定在右侧。

本机（This computer，macOS/Linux）和每台远程 Linux 服务器的标题下显示 CPU 使用率、内存使用率及已用/总内存（GiB），每 5 秒刷新。CPU 按相邻两次系统计数器采样计算，首次采样显示 `—`。Linux 读取 `/proc/stat` 和 `/proc/meminfo`，内存为 `MemTotal - MemAvailable`；macOS 使用系统 CPU 计数器、`vm_stat` 和 `sysctl`，内存包含应用、不可分页和压缩内存，扣除可清除内存。macOS 采样使用系统 Python 3，无第三方依赖。仅通过现有连接执行只读采样，不安装服务。服务器断开、读取失败或数据过期时显示 `—`。同一台机器的多个 Space 共用一次采样，收起项目列表后仍显示资源占用；没有连接服务器时也显示本机数据。

Spaces 面板运行时，每 5 分钟自动 fetch 已打开项目的远程分支；首次识别仓库后也会执行。同一台机器上共享 Git 目录的 worktree 只 fetch 一次，同时最多处理两个仓库。完成后刷新所有相关 Space 的 `↑领先 / ↓落后`。计数仍以各分支的 upstream 为准。

标题旁的刷新按钮可立即 fetch；认证或网络失败会显示 `Retry`，失败后按正常间隔重试。使用所在机器的现有 Git 凭据，不弹出交互登录；离线机器跳过。当前 fetch 执行器支持 macOS/Linux，只 fetch、不 pull 或合并，不清理引用、不递归子模块、不覆盖 `FETCH_HEAD`。可在布局的 `personal-spaces` props 中添加 `autoFetch` 控制开关（默认开启），或用 `fetchIntervalSeconds` 控制间隔（默认 300，最短 60 秒）。

右上角 Files 打开文件树和只读预览，Changes 打开 Git 变更与 diff。点击当前已打开的按钮可收起面板；每个 Space 分别记住面板选择，单 Agent 视图同样可用。这两个面板直接使用 Herdr 自带的 `files` / `changes`。

文件预览支持拖选文字后 Cmd+C 复制，点击内容后 Cmd+A 可全选。个人标签栏会在启动及打开 Files/Changes 时修正原生编辑器的颜色映射，让选区使用蓝色强调色；侧栏和标签栏仍保留原来的悬停配色。

默认 JetBrains Mono / Geist，终端基础字号 14、界面缩放 1.1（当前显示字号 15.4）。原始基线保存在 Git 标签 `baseline-t3-bf05b35`。

## 文件

| 路径 | 用途 |
| --- | --- |
| `layouts/herdr-personal.json` | 布局、尺寸、边距和面板引用 |
| `themes/herdr-personal.json` | 配色 |
| `mods/personal-*` | 七个独立的界面面板 |
| `keys.json` | 个人布局专用快捷键 |
| `preferences/settings.json` | 当前字体、缩放、声音等偏好快照 |
| `preferences/keys.json` | 原有完整快捷键快照，供参考 |
| `provenance.json` | 原仓库、提交和环境信息 |
| `docs/upstream/` | 原作者 README 与 RECIPE |

## 应用与验证

需要已安装并启动的 Herdr、Python 3 和 Node.js。默认配置目录是 `~/.config/herdr-app`，也支持 `HERDR_APP_HOME` 或 `--home`。

```sh
python3 scripts/manage.py install --dry-run
python3 scripts/manage.py install
python3 scripts/manage.py check
python3 scripts/manage.py activate
```

安装前会备份配置到配置目录同级的 `herdr-app-backups/personal-时间/`；不覆盖原 T3 布局、其他面板或已有快捷键。重复安装只更新本仓库管理的文件；检测到配置目录中的手工改动会停止，便于先将改动收回仓库。

安装仅补充缺少的偏好设置。明确需要将仓库里的偏好应用到本机时，使用 `install --apply-preferences`。原完整快捷键快照不会自动覆盖本机的全局或终端键位。

Node.js 默认从 PATH 查找；可通过 `NODE` 指定。此电脑也可自动使用现有的本地运行时。

## 快捷键与回退

- Shift+Insert：在终端中粘贴剪贴板内容，macOS 原有 Cmd+V 也可继续使用。
- Cmd+Shift+B：切换 Spaces / Focus。
- Cmd+Shift+A：切换单 Agent 视图。
- Cmd+Shift+S：收起或恢复当前已完成 Agent（Focus 模式）。

回到原 T3 界面：

```sh
herdr-app do layout.switch --name herdr-t3
```

回到 Herdr 默认界面：

```sh
herdr-app do layout.switch --name main
```

界面文件热加载，不需要结束终端或 Agent。

## 来源

基于 [JinJieBeWater/herdr-t3](https://github.com/JinJieBeWater/herdr-t3)，提交 `bf05b354f5fc1ed80106a0d3fc7e02f0801d90b6`；部分面板源自 [Herdr App](https://github.com/herdrdev/herdr-app)。保留 Apache-2.0 许可证与原作者文档。个人改动包括独立命名空间、仅含 Spaces 的侧栏、项目右侧 Agent 状态计数、现有偏好快照及安装验证流程。

