# Herdr Personal

从当前 Herdr T3 界面建立的个人配置仓库。布局、主题和 7 个面板使用独立名称，后续可在这里修改并通过 Git 保存每一版。

当前界面：Herdr 0.1.12，T3 作者配色，侧栏仅显示 Spaces。每个项目右侧按状态显示 Agent 图标和数量：橙色 `!` 需要处理、蓝色旋转图标运行中、实心点已完成、空心点空闲。活跃子 Agent 的紧急状态会反映在父 Agent 上，没有 Agent 的项目不显示状态。

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

