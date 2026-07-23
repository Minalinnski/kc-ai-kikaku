# ⚓ KC AI 企画室(kc-ai-kikaku)

舰队Collection 活动 AI 参谋:导入你自己的舰队 Box,AI(Claude)通读社区攻略全文——
锁船表、多号机表、倍卡表、全部 noro6 配装与敌方配置——生成**你专属的锁船表**和**逐图逐阶段配装方案**。

当前活动:**2026夏活「反撃!第三十一戦隊の戦い」**(E1–E5+E6)
攻略来源:[2026夏攻略【秋月改二牧场开荒组】](https://shimo.im/docs/rtk5YtznUfYtqbRH)(微博@天真善良可爱的秋月酱 / B站@HanabiOfficial)。
攻略数据(全文、配图 VLM 转录、31 组 noro6 机读配装)已预抓取并随仓库分发,`git pull` 即可获得更新。

> 本仓库是个人辅助工具,与攻略作者无关。分析结果仅供参考,**锁船不可逆**,下场前请核对攻略原文。

## 快速开始

需要:[Node.js](https://nodejs.org/) 18+、一个 [Anthropic API Key](https://console.anthropic.com/settings/keys)(`sk-ant-api03-…`,订阅版 OAuth token 不可用)。

### 方式 A:自托管服务器(推荐,发帐密给朋友用)

管理员部署一次,key 只存在服务器上(绝不进浏览器/前端产物),朋友凭帐密登录即用:

```bash
git clone https://github.com/Minalinnski/kc-ai-kikaku.git
cd kc-ai-kikaku/web && npm install && npm run build && cd ..
cp web/.env.example web/.env            # 填入 API Key
cp server/.env.example server/.env      # 设置 AUTH_USERS 帐密列表
node server/index.mjs                   # http://localhost:8787
```

服务器启动时会自检构建产物中不含真实 key。**分析任务在服务端运行**:点开始后可关页,
回来自动接上进度;结果按用户隔离保存(server/runs/)。每用户日配额默认 4 次
(server/.env 的 RUN_QUOTA_PER_DAY)。要给朋友用,把 8787 端口暴露出去即可
(内网直连 / Tailscale / frp / 挂个反代,按你的网络环境来;公网暴露建议套 HTTPS)。

### 方式 B:本地自跑(自己一个人用)

```bash
cd kc-ai-kikaku/web
npm install
cp .env.example .env      # 填入你的 API Key
npm run dev               # http://localhost:5173(dev 服务器代理注入 key)
```

- 两种方式 key 都不进前端:由本地代理/服务器在转发到 Anthropic 时注入,浏览器只见占位符;
  同源代理也顺便绕开了浏览器 CORS 和组织级 browser-access 限制。
- 建议在 Anthropic 控制台给 Key 设置用量上限。一次完整分析(总览+E1~E5)约
  **$1~3**(Opus 4.8)或 **$0.5~1.5**(Sonnet 4.6),攻略语料走 prompt cache,逐图并行。

### 使用流程

1. **导入 Box**(三种格式自动识别):
   - **noro6 制空権シミュレータ**(推荐):在[「艦娘/装備管理」](https://noro6.github.io/kc-web/#/manager)
     把游戏数据反映进去后,复制**艦娘コード**与**装備コード**两段 JSON 分别粘贴(自动合并,运改修/活动札都识别);
   - **艦隊分析格式**(api_*):KC3Kai 等工具导出的舰娘/装备 JSON;
   - **kckit box_snapshot.json**:poi + kckit 插件用户直接选文件。
2. **运行分析**:选择海域,点开始。约 5~15 分钟:先产出锁船总方案,再逐图产出各阶段配装。
3. **查看结果**:③锁船总表(按札分组,缺船/练度预警/备选)、④逐图配装(逐槽装备含星级、陆航、支援)。
   结果自动保存在浏览器;换设备用「存档导出/导入」。
4. **攻略资料**:锁船表/多号机表转录、攻略正文存档(含原图)、noro6 配装索引,随时对照原文。

## 攻略更新(维护者)

```bash
pip install -r pipeline/requirements.txt && playwright install chromium
python3 pipeline/check_update.py    # 正文 hash 快检;退出码 1=有更新
```

有更新时重跑归档管线,然后提交——使用者 `git pull` 即得:

```bash
python3 pipeline/fetch_doc.py main    "https://shimo.im/docs/rtk5YtznUfYtqbRH"   # 主攻略(全文+图)
python3 pipeline/fetch_doc.py lowdiff "https://shimo.im/docs/odyAOtsnVIdVPzAf/"  # 低难度文档
python3 pipeline/fetch_sheet.py lock  "https://shimo.im/sheets/GvhogtzTADp1mo1Q/MODOC/"  # 锁船表截图
python3 pipeline/fetch_noro6.py                                                  # 解码全部 noro6 短链
python3 pipeline/transcribe_images.py                                            # VLM 转录新配图(需 ANTHROPIC_API_KEY)
python3 pipeline/build_aliases.py                                                # 昵称别名库蒸馏(证据对齐,需 key)
# 锁船表/多号机表变动时:对照 data/shimo/lock/ 截图核对 data/extracted/*.json
python3 pipeline/build_guide_pack.py                                             # 汇编 → web/public/data/guide.json
python3 pipeline/build_master.py                                                 # (低频)舰娘/装备 master 更新
```

抓取原理:石墨文档 headless Chromium 渲染(图片懒加载需滚动收割);锁船表是 canvas 渲染,
超宽视口整表截图 + VLM 转录;noro6 短链 `kc.noro6.net/s/xxx` 是 302 → `?data=`(lz-string),
直接解码出精确编成/装备/敌配置,无需浏览器。

## Agent 设计

- 浏览器直连 `@anthropic-ai/sdk`,默认 `claude-opus-4-8` + adaptive thinking;
- 结构化输出(`output_config.format` json_schema)保证结果可渲染;
- 调用结构:锁船总方案 → 全图并行配装(首token门控写热缓存)→ 机器校验 + 自动修复回路
  (确定性核查装备/舰娘持有量冲突,只把冲突位喂回 AI 修补,最多迭代 2 轮);
  system/攻略语料/box/锁船方案四级 `cache_control`(1h TTL)断点,并行调用全走缓存读;
- 语料含:攻略全文(配图替换为 VLM 转录,含倍卡表/陆航配置/E6编成)、锁船表/多号机表
  结构化转录、31 组 noro6 解码配装(舰+装备星级+基地航空+敌配置)、44 条证据对齐的
  中文昵称对照、玩家全量 Box 紧凑文本。
- 可信度层:「⑤ 贴条·校验」页 = 机器校验报告 + 舰娘→札对照板(含游戏内实际贴札);
  逐图配装每阶段可一键在 noro6 打开做第三方制空/索敌核算。

## 目录

```
pipeline/            # Python 抓取/构建脚本(维护者用)
data/                # 原始归档:石墨文档存档、noro6 解码、表格与配图转录
web/                 # 前端(Vite + Vue3 + TS),npm run dev 即用
  public/data/       # 随仓库分发的 guide.json / master.json / 攻略配图
```
