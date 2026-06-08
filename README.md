# 吕祖灵签

“吕祖灵签”是一个围绕在线求签、签号查询、传统解签与未来 AI 问事解读设计的静态网页原型。

## 当前阶段

项目使用 HTML5、CSS3、原生 JavaScript 和 JSON。基础页面仍可静态展示；AI 个性化解读需要通过 `server.py` 提供服务器端接口。

## 目录结构

```text
lvzu-lingqian-web/
├─ index.html
├─ style.css
├─ app.js
├─ README.md
├─ data/lvzu-signs.json
├─ data/other-signs.json
├─ scripts/import_lvzu_wechat.py
├─ scripts/import_other_signs.py
├─ scripts/repair_xuantian.py
├─ assets/icons/
├─ assets/images/
└─ references/
```

`references/` 中的图片仅用于视觉氛围参考，页面没有照搬原网站布局或素材。

## 启动方法

不使用 AI 时，在项目目录运行：

```bash
python -m http.server 8905
```

使用 AI 个性化解读时，改用：

```bash
python server.py
```

本地访问地址：<http://127.0.0.1:8905>

不要直接双击打开 `index.html`，否则浏览器可能阻止 JSON 文件读取。

## 当前签文资料

`data/lvzu-signs.json` 当前已录入第一签至第一百签。资料整理自微信公众号自助解签，包含签号、古人、签诗、简短分类提示和逐签来源链接。

来源内容可能存在错漏、重复或分类冲突，当前数据不代表正式校订版本。公众号文章中的现代长篇解说没有整段复制进项目。

资料整理辅助文件：

- `data/lvzu-source-links.json`：一百篇来源文章目录；
- `data/lvzu-source-extract.json`：经过清理的原始字段；
- `scripts/import_lvzu_wechat.py`：重新下载和生成 JSON 的导入脚本。

## 灵签签库

“灵签签库”统一收录吕祖灵签及六套其他灵签，可按灵签类型、签号和签诗关键词查询，并打开逐签详情：

- 吕祖灵签：100 签；
- 关帝灵签：99 签；
- 观音灵签：100 签；
- 妈祖灵签：100 签；
- 文昌帝君灵签：99 签；
- 太上老君灵签：28 签；
- 玄天上帝灵签：50 签。

数量以实际收录资料为准。关帝灵签与文昌帝君灵签的来源合集目前均未收录第一百签，网站不会伪造缺失内容。`data/other-signs.json` 保存用于页面展示的签诗、简短整理、分类提示与逐签来源链接；长篇现代解说未整篇复制。

玄天上帝灵签的分类解读已改用北帝庙灵签公开页面补正，避免旧公众号来源中部分签文分类缺失或错位。

相关辅助文件：

- `data/other-signs-source-extract.json`：来源页字段提取结果；
- `data/wespy-*/`：六套来源文章目录；
- `scripts/import_other_signs.py`：重新下载并生成六套签库的导入脚本；
- `scripts/repair_xuantian.py`：从北帝庙灵签公开页面补正玄天上帝灵签分类内容，并用 OpenCC 转为简体。

重新生成时需要安装 `requests` 与 `beautifulsoup4`，并保留 `data/wespy-*/` 目录：

```bash
python scripts/import_other_signs.py
```

如需重新补正玄天上帝灵签，需要额外安装 `opencc-python-reimplemented`：

```bash
python -m pip install opencc-python-reimplemented
python scripts/repair_xuantian.py
```

如需重新从来源合集生成资料，请先安装 `requests` 与 `beautifulsoup4`，再运行：

```bash
python scripts/import_lvzu_wechat.py
```

## 新增一支签

1. 打开 `data/lvzu-signs.json`。
2. 按现有对象结构新增一项。
3. 保证 `number` 在 1 至 100 之间且不重复。
4. 未经可靠资料确认的字段请保留为空字符串，页面会自动隐藏空字段。
5. 检查 JSON 格式后刷新页面。

随机求签会自动从 JSON 中实际录入的一百签抽取，不需要修改固定数量。

## 本地记录

求签与查签记录保存在浏览器 `localStorage` 中。可以在“我的签册”页面逐条删除或清空全部记录。也可以在浏览器站点数据设置中删除 `127.0.0.1:8905` 的本地数据。

## AI 个性化解读配置

前端不会保存或暴露 API Key。AI 请求由 `server.py` 的 `/api/ai-reading` 转发到 OpenAI Responses API。

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填写 DeepSeek 或 OpenAI 的 API Key。
3. DeepSeek 默认配置为 `AI_PROVIDER=deepseek` 与 `DEEPSEEK_MODEL=deepseek-v4-flash`。
4. 运行 `python server.py`。
5. 打开签文详情页的“问事”标签，点击“生成 AI 问事解读”。

PowerShell 也可以临时设置环境变量：

```powershell
$env:AI_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
python server.py
```

## 公网部署

本项目已包含 `server.py`，可部署到支持 Python Web Service 的平台，例如 Render、Railway、Fly.io 或 VPS。部署时不要上传 `.env`，API Key 必须在平台后台的环境变量中配置。

推荐部署参数：

- Build Command：`pip install -r requirements.txt`
- Start Command：`python server.py`
- PORT：使用平台自动提供的端口变量，不需要手动固定为 8905
- 环境变量：`AI_PROVIDER=deepseek`、`DEEPSEEK_API_KEY=你的 DeepSeek Key`、`DEEPSEEK_MODEL=deepseek-v4-flash`

`server.py` 会监听 `0.0.0.0:$PORT`，适合云平台公网访问；本地运行时仍可访问 `http://127.0.0.1:8905`。

API Key 绝对不得写入前端 HTML、CSS、JavaScript 或公开仓库。

## 尚未完成

- 一百签可靠版本的正式校勘与异文对照；
- 六套其他灵签的正式校勘、缺签补源与异文对照；
- AI 接口的生产环境限流、日志脱敏和风控；
- 账号同步与跨设备签册；
- 更完整的跨签库全文检索与收藏功能。
