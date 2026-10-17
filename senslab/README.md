# SensLab Personal 1.0

个人FPS灵敏度实验室。默认1600 DPI，不预设实际cm/360，更不凭空输出最佳数值。本站采用研究启发的个体重复测量方案，尚未经过独立的测量效度验证。

## 打开与源码

在线入口（第三方静态托管，并非GitHub Pages）：
https://raw.githack.com/zhaowuc/ai-vision-smart-car-control/senslab-personal-20261017/senslab/index.html

首次访问可能出现托管方的确认页。正式测试请在独立的桌面Chrome/Edge标签页打开，不在嵌入预览中运行。请定期导出JSON备份；不同地址/浏览器不会自动同步。共享托管域名不是私人存储边界，不填写隐私信息。长期使用可选择离线HTML或自有GitHub Pages。

这个目录的8个app-XX.bin是按编号拼接的gzip传输片段，包含完整可编辑HTML、CSS和JavaScript，没有外部运行库。index.html在本地解压并校验SHA-256后运行，不上传测试数据。站内“方法与文献”提供完整离线网页导出。也可以下载本目录后运行：

```sh
python restore.py
```

恢复出的SensLab-Personal.html就是完整源代码与独立运行版。在Linux/macOS也可使用：

```sh
cat app-*.bin | gzip -dc > SensLab-Personal.html
```

完整HTML SHA-256：052589b7c129e767245e6849d12f18345b21b6eb94f3279836f304f6aa75e6c2

如需长期Pages发布，将恢复的完整HTML命名为index.html放入自己的独立仓库，再于Settings → Pages启用main根目录发布。本次只新增独立分支中的senslab目录，没有改动原项目main分支或原有文件。

## 测试流程

1. 固定1600 DPI、缩放、视口、FOV、设备、鼠标垫与握持。实测游戏内角度对应的桌面距离至少3次，输入cm/360中位数。
2. 完成12条尺子校准：横纵两个方向，快慢速度，重复性检查。不将浏览器movementX自动当作硬件DPI计数。原始输入申请失败时只能练习，不能用于正式筛选。
3. 五候选探索，覆盖精细微调、目标切换、连续跟踪及90–160度转向。每条件有适应，每任务后休息。至少3个不同测试日，建议5日完成位置平衡；不完整会话不进入选优。
4. 边界领先则扩大搜索；非边界可先做约5%步长的独立细化。原基准一直保留。旧数据不混入新实验。
5. 锁定最多3个决赛条件，包含原基准；随后在6个新的不同测试日确认。探索与确认数据分开。不要根据中途成绩改规则。
6. 以cm/360跨游戏换算，再用尺子在目标游戏复核。提供Valorant、Apex、CS2、Overwatch、Delta Force参考标度；未知或非线性滑块用至少3个实测点，按角增益分段插值，不外推。ADS按实际水平FOV单独处理。
7. 在三角洲烽火地带、全面战场分别进行交替对照并记录舒适度、转向受限、过冲和装备条件。网页不能自动证明真实对局收益。

## 指标与边界

透视相机与球面角度判定，不是普通屏幕点点测试。四项分别保存有效命中/秒、命中率、跟踪覆盖率、RMS角误差、FPS、超时、点击与跟踪摘要，以及无效原因和主观费力度。

同一完整会话内计算相对基准的任务比值，按预声明权重取几何平均；同日重复会话合并。区间基于测试日的配对log比值bootstrap，不把每次点击当独立样本。多候选比较做Bonferroni调整。小样本、学习和跨日相关性仍限制推断。

默认守门条件：无疼痛/明显不适，平均费力度不高于5/10，微调命中率下降不超过5个百分点，任一任务表现下降不超过10%。3%实用差异、日数、休息与任务参数均为本项目的实验设计选择，不是论文验证的普适人体阈值。近优集合只涵盖已测候选，不表示连续区间内每个数都已验证。

本工具不承诺终身唯一或所有游戏都最优的灵敏度。研究支持原则，不代表作者验证或认可此网站。软件自动测试不代替用户真实鼠标、浏览器输入和游戏内验证。

## 依据（核对日期2026-10-17）

- Boudaoud, Spjut & Kim (2023), Mouse Sensitivity in First-Person Targeting Tasks. DOI:10.1109/TG.2023.3293692. https://research.nvidia.com/publication/2023-07_mouse-sensitivity-first-person-targeting-tasks
- Rogers et al. (2024), KovaaK's aim trainer as a reliable metrics platform for assessing shooting proficiency in esports players: a pilot study. DOI:10.3389/fspor.2024.1309991. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1309991/full
- Donovan et al. (2022), Assessment of human expertise and movement kinematics in first-person shooter games. DOI:10.3389/fnhum.2022.979293.
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- https://kovaaks.com/kovaaks/sens-converter
- https://kovaaks.com/kovaaks/sens-converter/valorant-to-delta-force
- https://aimlabs.com/articles/aimlabs/how-to-configure-and-convert-your-sensitivity-in-aimlabs/

参考yaw为Valorant 0.06996、Apex/CS2/默认Source 0.022、Overwatch 0.0066、Delta Force 0.03。来自训练工具开发者的换算说明，不是游戏厂商对每版本、设备配置及ADS的保证；实测复核优先。
