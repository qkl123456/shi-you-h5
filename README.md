# 诗游 · 地名搜诗（H5）

**公网地址（手机可直接打开）：** <https://qkl123456.github.io/shi-you-h5/>

仓库：<https://github.com/qkl123456/shi-you-h5>

静态单页：用地名检索《唐诗三百首》诗作，十张成片卡可翻看正面插画与背面地景信息。

## 目录

```
.
  index.html
  css/app.css
  js/app.js
  data/places-index.json   # 地名索引（构建生成）
  data/poems.json          # 精简诗库（构建生成）
  assets/cards/            # front-NNN.png / back-NNN.png
  README.md
```

## 重建数据

在项目根或任意处执行：

```bash
python3 scripts/build_data.py  # 源码树在本机 G:\grok工作\唐诗古风插画\h5\scripts
```

会只读 `catalog.json` 与 `cards/card-copy.json`，并复制十张正背图到 `assets/cards/`（ASCII 文件名）。

## 本地预览（电脑）

```bash
cd .   # 或本机 G:\grok工作\唐诗古风插画\h5
python3 -m http.server 8765
```

浏览器打开：<http://127.0.0.1:8765/>

> 建议用本地 HTTP 服务打开（`fetch` 读 JSON）。部分浏览器对 `file://` 会拦截本地请求。

## 手机同网访问

1. 电脑按上面命令启动服务，并确认防火墙放行 8765。
2. 查电脑局域网 IP，例如：
   - macOS / Linux: `ip addr` 或 `ifconfig`
   - Windows: `ipconfig`
3. 手机连同一 Wi-Fi，浏览器访问：`http://<电脑IP>:8765/`

若在本仓库的 box / 远程环境，需把端口映射或用内网穿透后再给手机访问。

## 自检示例

```bash
# 索引应能命中
python3 -c "
import json
P=json.load(open('data/places-index.json'))['places']
for q in ['黄鹤楼','苏州','枫桥']:
  hits=[p['name'] for p in P if q in p['name'] or any(q in a for a in p.get('aliases',[]))]
  print(q, hits[:5])
"
```

## 已知限制

- `catalog.json` 中约有 80+ 首 `geo.places` 为空；仅能从 notes / travel_tip 弱抽取，地名覆盖不完整。
- 地名归一是启发式（别名表 + 词表），可能把泛称或典故地名一并收入。
- 成片插画仅十张；其余诗为文字详情。
- 中文路径已避免：卡图使用 `front-090.png` 等形式。
