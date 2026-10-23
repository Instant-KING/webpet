# WebPet Demo

> 一个 2D 角色「活」在网页里的最小可运行示例：站在卡片上、挂在下沿、探头偷看、
> 被拖走、自己巡逻，页面滚动 / 缩放 / 嵌套面板滑动时都不掉队。

**30 分钟能跑起来。** 详细架构见 [../ARCHITECTURE.md](../ARCHITECTURE.md)。

---

## 快速开始

```bash
npm install
npm run dev     # http://localhost:5173
```

生产构建：

```bash
npm run build   # 产物在 dist/
npm run preview # 预览生产构建
```

---

## 演示了什么

| 能力 | 怎么看 |
|---|---|
| **卡片吸附** | 把宠物拖到任意卡片边缘——它会选一个姿势贴上去 |
| **5 种吸附模式** | 每张卡片的 `data-webpet-attachment` 不同，行为也不同 |
| **自动巡逻** | 顶栏开关；开启后它每 8 秒飞去别的卡片 |
| **心情动画** | 顶栏「待机 / 思考 / 干活 / 成功 / 失败」切换 |
| **点击穿透** | 短按（≤8px）被宠物盖住的按钮，仍然会触发点击 |
| **位置记忆** | 刷新页面，宠物回到上次的位置（localStorage） |

### 卡片上的标记

```html
<div data-webpet-card data-webpet-attachment="top-bottom">…</div>
```

| `data-webpet-attachment` | 含义 |
|---|---|
| `auto` | 自动选最合适的边 |
| `top-bottom` | 能坐顶上，也能挂下沿 |
| `hang-top` / `hang-bottom` | 只挂上沿 / 只挂下沿 |
| `left-side` / `right-side` | 只贴左右边 |
| `right-side-peek` | 只从右侧探出半个身子 |
| `left-right` | 只贴左右两边 |
| `top-bottom-right` | 上、下、右三边 |
| `sit-top-only` | 只能坐在顶上 |
| `corner-grab` | 抓在四角 |

---

## 目录

```
demo/
├── public/webpet/spritesheet.webp   # 图集（1536×3744 = 8 列 × 18 行，192×208/帧）
├── src/
│   ├── App.tsx          # 演示页：卡片 + 控制条 + WebPetHost
│   ├── demo.css         # 演示页样式
│   └── webpet/          # 引擎本体（6 个文件，可直接拷到别的项目）
└── index.html
```

**`src/webpet/` 是引擎**，可以整体拷走：

| 文件 | 职责 |
|---|---|
| `types.ts` | 类型定义 |
| `defaultWebPetConfig.ts` | 默认规格 + `mergeWebPetConfig` |
| `PetCharacter.tsx` | 图集渲染（按行取帧、按间隔推进） |
| `WebPet.tsx` | 核心：吸附决策、坐标计算、拖拽、巡逻 |
| `webpet.css` | 角色与气泡样式 |

---

## 配置在哪

**`src/App.tsx` 顶部的 `CALIBRATED` 对象**就是这份宠物规格书：

```ts
const CALIBRATED: Partial<WebPetConfig> = {
  atlas: { frameWidth: 192, frameHeight: 208, columns: 8, rows: 18 },
  size: 148,
  animations: { idle: { row: 0, frames: 6, frameInterval: 160 }, … },
  poseAnchors: { peekTop: { y: 193 }, hangBottom: { y: 46 }, … },  // ← 角色专属
  poseOffsets: { … },                                              // ← 视觉微调
  edgeGap: 16, hotZone: 30, clickTolerance: 8, patrolDelayMs: 8000,
}
```

### ⚠️ 换角色必须改什么

| 字段 | 必须改？ |
|---|---|
| `atlas` | ✅ 图集几何变了就要改 |
| `animations` | ✅ 行号 / 帧数 / 帧间隔 |
| **`poseAnchors`** | ✅ **必须重新校准**（用 playground 的 AtlasInspector 拖） |
| `poseOffsets` | ⭕ 锚点对了但视觉差一点时微调 |
| `edgeGap` / `hotZone` / `clickTolerance` | ⭕ 手感参数，通常不用动 |

**`poseAnchors` 是「这个角色」专有的数据。** 不同角色的身材比例不同，
直接套用会导致「浮在卡片上」或「陷进卡片里」。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| **生图 / 图集自动生成未完成** | 需要自备图集（本 demo 的图集来自生产项目） |
| 只支持**横排单行**图集 | 竖排或散图需要先拼好 |
| 姿态固定 7 种 | 加新姿态要改 `types.ts` 的 `POSES` |
| 无多角色支持 | 一个页面一个实例 |
| 锚点需手动校准 | 换角色要拖一遍 |

---

## 一次拖拽发生了什么

```
pointerdown
   ├─ 被盖住的是按钮/链接？ → 记下，抬起时短按则触发它的 click
   └─ 否则开始拖拽
          ↓ pointermove
     targetAtPoint(x, y)      // 热区 + elementsFromPoint 穿透
          ↓
     choosePlacement(target)  // 选边、选姿态、定翻转
          ↓ pointerup
     documentPosition()       // 锚点 × 缩放 + flip 镜像 + offset + scroll
          ↓
     setPosition()            // 渲染 + localStorage
```

完整说明见 [../ARCHITECTURE.md](../ARCHITECTURE.md)。

---

## License

MIT
