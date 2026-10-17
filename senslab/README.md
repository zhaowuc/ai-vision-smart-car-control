# SensLab Personal 1.1.0

单次灵敏度比较实验。默认从瞄准实验入口开始，提供约 20 分钟完整模式和约 10 分钟快速模式。继续读取当前有效设置与校准，旧多日实验保留为独立的高级模式，不转换为新协议数据。结论用于选择值得带回真实游戏试用的已测候选，不代表终身最佳值或跨日独立验证。

构建与发布分开记录：运行构建脚本只生成本地产物；实际推送、托管地址与远端校验结果见交付时的发布验证记录。`deployment.json.source.base_commit` 指向修改前的来源提交 `b17ee236834f369982b41c153e4b076480b8081b`，不代表本修复已提交或部署。旧 `ux.js` 和 `upgrade-v102.js` 仅保留历史来源；新入口不请求它们，也不在加载时重新改写应用。

## 打开和继续已有数据

在 `senslab/` 目录运行：

```sh
python -m http.server 8080
```

使用独立的桌面 Chrome/Edge 标签页访问 `http://localhost:8080/`。也可直接打开完整 `SensLab-Personal.html`。`src/index.html` 是可编辑的多文件源码入口。分片加载器需要 HTTPS 或 localhost 的 WebCrypto 与 DecompressionStream；不能直接用 `file://` 打开加载器并期待跨文件 fetch 正常工作。

继续使用与原来相同的地址、浏览器和配置文件，才会读到该源下的 localStorage。更换域名、端口、浏览器或由网页切换到文件地址时，先在原入口导出 JSON，在新入口导入；不同源不会自动同步。不要清理站点数据。正式实验前建议保留一份外部 JSON 备份。

已保存的有效设置优先于历史预填。1600 DPI、75.2 cm/360、暂估 20 cm 横向行程等历史值，只能填补缺失字段并等待确认，不代表自动完成物理校准。20 cm 估计只用于范围提示。窗口或 FOV 变化与 DPI、设备、输入路径变化分开处理；普通鼠标移动诊断仅证明收到了事件，不等于物理输入校准。

鼠标锁定后系统箭头会隐藏，画面中央固定准星应持续可见。微调、切换、转向需要左键单击；跟枪只需让准星覆盖目标。按 Esc、失焦或锁定丢失会暂停当前小任务，恢复需要用户点击重新锁定。若没有有效校准，可进行不计分练习，不能将其结果视为可靠的物理 cm/360 推荐。

## 单次流程与时间预算

| 模式 | 共同熟悉 | 粗筛 | 阶段休息 | 复测 | 计划合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20 分钟完整 | 40 秒 | 5 条件 × 80 秒 | 40 秒 | 最多 3 条件 × 3 轮 × 80 秒 | 1200 秒 |
| 10 分钟快速 | 40 秒 | 3 条件 × 80 秒 | 40 秒 | 基准与 1 候选 × 2 轮 × 70 秒 | 600 秒 |

80 秒组由 15 秒适应、四类任务各 12 秒、三次过渡各 2 秒、评分与休息 11 秒组成。70 秒组使用 10 秒适应、相同 48 秒任务和 6 秒过渡、评分与休息 6 秒。候选数量不足时按实际数量执行。首次教程、用户暂停、延长适应、超出预算的评分等待和异常重测另计，计划时长不是强制截止时间。费力度和疼痛未作答时等待用户，不自动补成 0 分或无疼痛。

20 分钟候选为基准距离的 0.64、0.8、1、1.25、1.5625 倍；10 分钟只比较局部的 0.8、1、1.25 倍。例如 75.2 cm/360 对应 60.16、75.2、94 cm/360。数值较小意味着角增益较大，75.2 → 60.16 的相对角增益为 1.25 倍，即增加 25%。界面展示精度不代表物理测量具有同等精度。

粗筛随机排序并只用于挑选复测候选。复测保留原基准，使用平衡条件顺序、每轮新目标种子，以及同轮一致的任务难度和任务顺序。正式测量结束前遮蔽条件数值，这不是真正双盲。进入复测后冻结候选和规则。

最终分析与旧按测试日 bootstrap 的路径分开，以本次 2–3 轮配对复测为依据，展示原始表现、相对表现、每轮方向和变化范围，以及舒适度、输入质量、样本不足和基准漂移提示。单场不输出正式 95% 显著性或等效性结论。零命中可作为有效表现，但不能用极小数替代零分制造巨大优势。精度退步、疼痛或缺少稳定实用优势时，可以保留原设置；边界领先只提示搜索范围可能不足，不外推未测最佳值。

## 数据和迁移

主存储键继续使用 `senslab.personal.v1`。升级前将原始 JSON 保存到 `senslab.personal.v1.pre-single-v1`；仅在备份与保存成功后使用新增字段。备份失败时保留原工作区并禁止保存覆盖；读取或校验失败时也保留原始存储串，可通过导出JSON原样取回，再导入有效备份恢复，不应直接清空后重来。

旧 `studies` 记录保留原协议与结构。单次实验放在 `singleStudies`，通过 `protocolVersion`、`mode`、阶段和轮次区别；设置与校准快照、规则、随机种子、结果、评分、中断与重试等随实验保存。JSON 保留两个协议，CSV 增加协议和模式列。导入前也保存当前工作区到 `.pre-import`，导入仍会替换当前工作区，因此先导出外部备份。

刷新、跨午夜或稍后继续应保留已经完成的小任务；长间隔恢复需要显示为新的会话片段，不能宣称实际连续完成了 20 分钟。重试保留原因与记录，不能只保存最高成绩。设备变化或不想继续时，可结束本次并保留记录，未完成实验不产生完整推荐。上述迁移、恢复和完整任务流程的实际验收状态见 `QA.md`。

## 源码、构建与恢复

需要 Python 3.10+；应用无后端、账号或外部运行库。真实源码位于 `src/`：`index.html`、`styles.css`，以及按顺序执行的 `onboarding.js`、`core.js`、`session-core.js`、`session-ui.js`、`app.js`。编辑源码后执行：

```sh
python build.py
python tests/package.test.py
```

构建将所有样式和脚本一次性内联为 `SensLab-Personal.html`，再生成 `app.html.gz` 和按编号拼接的 8 个 gzip 分片。`index.html` 只下载、解压、检查**完整最终 HTML** 的 SHA-256，然后执行该 HTML。任何缺片、解压错误或摘要不一致都停止加载，不跳过校验、不退回旧补丁。

构建同步 `index.html` 和 `restore.py` 中的摘要、`transport-manifest.json`、`deployment.json` 及 `SHA256SUMS.txt`。`deployment.json` 明确标记 `local-only`。在线分片解压结果与离线 HTML 必须逐字节一致，因此其 CSS、脚本内容与执行顺序相同；存储源、权限和真实设备差异仍须单独验证。

需要从分片恢复完整最终网页时：

```sh
python restore.py
python restore.py --output restored-SensLab.html
```

恢复脚本先验证最终 HTML 摘要再写文件；若同名文件已是相同内容，只确认成功，不重写；若内容不同则拒绝覆盖。恢复结果已包含新协议与教程，无须加载旧补丁脚本。

## 自动化检查

从 `senslab/` 执行：

```sh
node --check src/core.js
node --check src/session-core.js
node --check src/session-ui.js
node --check src/app.js
node --test
python build.py
python tests/package.test.py
```

加载器浏览器集成检查需另装 Playwright 与 Chromium：

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/loader.test.py
python tests/browser-session.py
```

默认使用 Playwright 管理的 Chromium。已有浏览器可以设置 `CHROMIUM_EXECUTABLE_PATH`；PowerShell 示例：

```powershell
$env:CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
python tests/loader.test.py
python tests/browser-session.py
```

`package.test.py` 不启动浏览器，校验当前源码、全部脚本、完整 HTML、gzip、分片、哈希、元数据及恢复脚本的正常/篡改分支。`loader.test.py` 使用临时 localhost 服务和隔离浏览器上下文，使用原生 fetch、gzip 解压和 WebCrypto，检查线上入口与完整 HTML 的脚本一致性、缺片失败及有效 gzip 被篡改后的拒绝执行。它不接触用户浏览器存储，不生成用户成绩，不证明真实鼠标测量精度。

真实输入验收要在原使用环境、原保存设置与有效校准上直接进行：确认无需重做尺子校准即可进入新实验；确认固定准星、输入诊断、Pointer Lock、四任务操作、暂停恢复，以及计划时间与额外等待分别记录。自动化模拟不能声称已实测通过，也不能证明游戏表现改善。

## 发布

构建与测试不会推送仓库或部署网站。实际发布时应将新 `index.html` 与全部 8 个分片作为同一版本一起上传，建议同批提供完整 HTML、恢复脚本与摘要文件；混合旧新分片会被完整性校验拒绝。不能只替换离线 HTML，让线上保留旧实验。上传后仍须在实际托管地址验证加载、存储、恢复与真实输入，并记录部署证据。未完成这些步骤时，交付说明应保持“本地版本，尚未上线”。

## 方法参考

使用前核对了 NVIDIA [Mouse Sensitivity in First-Person Targeting Tasks](https://research.nvidia.com/index.php/publication/2023-07_mouse-sensitivity-first-person-targeting-tasks)、MDN [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) 与 [movementX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX)。原始输入请求、鼠标锁定和物理单位换算需结合设备校准。这里的 10/20 分钟、适应时长、最低点击数和守门线是本工具的预算与工程规则，不声称出自论文，也不构成个人最优灵敏度的科学保证。
