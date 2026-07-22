# ⚓ 舰C活动参谋(kc-event-advisor)

舰队Collection 活动个性化参谋:导入你自己的舰队 Box,AI(Claude)通读社区攻略全文
(锁船表、多号机表、全部 noro6 配装与敌配置),生成**专属锁船表**和**逐图逐阶段配装方案**。

当前活动:**2026夏活「反撃!第三十一戦隊の戦い」**(E1–E5+E6)。
攻略来源:[2026夏攻略【秋月改二牧场开荒组】](https://shimo.im/docs/rtk5YtznUfYtqbRH)
(微博@天真善良可爱的秋月酱 / B站@HanabiOfficial,本仓库仅作个人辅助工具,与作者无关)。

## 给使用者

1. 打开部署好的网页,填入 Anthropic API Key(仅存浏览器本地,请求直连 Anthropic)。
2. 导入你的 Box(三种格式自动识别):
   - **noro6 制空権シミュレータ**(推荐):[艦娘/装備管理](https://noro6.github.io/kc-web/#/manager)
     导出的艦娘コード `[{"id":…,"ship_id":…,"lv":…,"st":[…],"area":…}]` 与装備コード `[{"id":…,"lv":…}]`,
     两段分别粘贴自动合并(运改修、活动札都识别)。
   - **艦隊分析格式**(api_*):KC3Kai 等工具导出的舰娘/装备两段 JSON。
   - **kckit box_snapshot.json**(poi + kckit 插件用户):直接选文件。
3. 「运行分析」→ 等 5~15 分钟 → 查看锁船总表与逐图配装。结果自动保存在浏览器;
   跨设备用「存档导出/导入」迁移(刻意不做账号系统:纯静态站零后端零隐私负担,box 不出你自己的浏览器)。

成本:一次完整分析约 $1~3(Opus 4.8)或 $0.5~1.5(Sonnet 4.6),攻略语料走 prompt cache。

> ⚠️ 锁船不可逆。AI 输出仅供参考,锁船前请对照「⑤ 攻略资料」里的原文存档和攻略最新更新。

## 给维护者:数据管线

攻略数据是**预抓取**后随前端一起发布的(`web/public/data/`)。日常先跑更新检测:

```bash
python3 pipeline/check_update.py    # 比对线上正文与本地快照 hash;退出码 1=有更新
```

有更新时重跑归档管线:

```bash
pip install -r pipeline/requirements.txt && playwright install chromium

python3 pipeline/build_master.py                                          # 舰娘/装备 master(kc-web 源)
python3 pipeline/fetch_doc.py main    "https://shimo.im/docs/rtk5YtznUfYtqbRH"   # 主攻略(全文+图)
python3 pipeline/fetch_doc.py lowdiff "https://shimo.im/docs/odyAOtsnVIdVPzAf/"  # 低难度文档
python3 pipeline/fetch_sheet.py lock  "https://shimo.im/sheets/GvhogtzTADp1mo1Q/MODOC/"  # 锁船表截图
python3 pipeline/fetch_noro6.py                                           # 解码全部 noro6 短链
python3 pipeline/transcribe_images.py                                     # VLM 转录新增配图(需 ANTHROPIC_API_KEY)
# 若锁船表/多号机表有改动:对照 data/shimo/lock/ 截图更新 data/extracted/*.json
python3 pipeline/build_guide_pack.py                                      # 汇编 → web/public/data/guide.json
```

配图处理:陆航配置/倍卡表/E6编成等截图已由 VLM 转录进 `data/extracted/image_notes.json`,
喂给 agent 的语料中 `[IMAGE_n]` 会替换为转录文本;网页「攻略资料」里仍显示原图。

石墨文档抓取原理:headless Chromium 渲染(文档需处于「任何人可阅读」);锁船表是 canvas
渲染,以超宽视口整表截图后人工/VLM 转录为 `data/extracted/*.json`;noro6 短链
`kc.noro6.net/s/xxx` 是 302 → `?data=`(lz-string),`curl + lzstring` 直接解码,无需浏览器。

## 前端开发

```bash
cd web
npm install
npm run dev        # 本地开发
npm run build      # 类型检查 + 构建 → dist/
node smoke.ts      # 语料组装冒烟(不调 API)
```

技术栈:Vue 3 + Vite + TS;`@anthropic-ai/sdk`(浏览器直连,`dangerouslyAllowBrowser`);
结构化输出用 `output_config.format`(json_schema);攻略语料/box/锁船方案三级
`cache_control` 断点,逐图调用命中缓存。

## 目录

```
pipeline/            # Python 抓取/构建脚本
data/                # 原始归档(石墨文档存档、noro6 解码、锁船表转录)
web/                 # 前端(Vite+Vue3+TS)
  public/data/       # 发布给前端的 guide.json / master.json / 攻略配图
.github/workflows/   # GitHub Pages 自动部署
```
