# WebPet Playground

这是 `webpet` Skill 的本地调试窗口。它复用 WebPet 内核，用真实 DOM 卡片检查拖拽吸附和滚动同步，并提供逐帧替换、整行替换、预览、校准和导出。

Playground 不负责生图，也不读取任何生图 API key。用户可以在外部工具生成动作素材，再把图片交给 Agent；Agent 负责抠图、切帧、统一尺寸和写入项目目录。窗口只用于确认结果和修正个别帧。

## 启动

Windows 用户可以双击 `启动WebPet.bat`。也可以在本目录运行：

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5987/`。端口固定为 5987，端口被占用时 Vite 会直接报错，不会偷偷切换端口。

## 项目存档

启动时会扫描 `WEBPET_PROJECT_ROOT`（默认是 `playground/webpet-project/`）：

```text
webpet-project/
|-- manifest.json
|-- arrest/
|   |-- idle/
|   |   |-- frame-00.webp
|   |   |-- frame-01.webp
|   |   `-- strip.webp
|   `-- <其他状态机>/
|       |-- frame-00.webp
|       `-- strip.webp
`-- animation/
    `-- spritesheet.webp
```

`arrest/<状态机>/frame-XX.webp` 是唯一帧级源文件。`strip.webp` 是同一状态机的横向缓存，`animation/spritesheet.webp` 是全部状态机合成后的运行时图集。刷新时优先读取帧文件并重新合成横条；没有帧文件时才使用 `strip.webp`。浏览器 IndexedDB 只作为示例素材无法读取时的回退。

可在 `.env` 指定：

```dotenv
WEBPET_PYTHON=python
WEBPET_PROJECT_ROOT=./webpet-project
```

## Playground 能做什么

- 编辑动画、mood、卡片吸附模式、Pet 尺寸和吸附姿势锚点/偏移。
- 让调试面板跟随当前真实吸附状态，直接校准对应姿势。
- 在图集面板单点替换某一帧，或上传一张横向 JPG、PNG、WebP 替换整行。
- 上传素材会调用本地 PetX 风格处理脚本，执行绿幕清理、主体保留、裁边和尺寸归一化。
- 新建状态机会复制当前动作的第一帧作为初始帧；内置状态不可删除，自定义状态可以删除。
- 帧修改会同步写入 `arrest/<状态机>/frame-XX.webp` 和 `strip.webp`。
- 导出 Agent JSON 和 `spritesheet.webp`；JSON 包含图集几何、状态机行/帧映射、吸附锚点、偏移和行为参数。

## Agent 的素材流程

用户把外部生图或手绘得到的图片交给 Agent，并说明每张图片对应的状态机和帧顺序。Agent 应：

1. 为每个状态机建立 `arrest/<状态机>/`。
2. 对输入图执行抠图、切帧、统一单元格尺寸和 baseline 对齐。
3. 按编号写入 `frame-00.webp`、`frame-01.webp` 等帧源。
4. 从帧源合成 `strip.webp`，再合成 `animation/spritesheet.webp`。
5. 启动本 Playground，让用户检查动画、吸附位置和滚动同步。
6. 根据反馈只替换问题帧，重新生成派生图集并导出 JSON。

连续动作可以先由外部模型生成一整条横向图，再交给 Agent 处理；需要修正时仍以帧文件为准，单帧可以在外部工具重新生成或在 Playground 上传替换。

## 与通用 Skill 的关系

- `src/webpet/` 是可迁移的 React/HTML/CSS 内核。
- `server/sprite_processor.py` 是本地素材处理适配层，不包含业务 API。
- `AtlasInspector.tsx` 和 `main.tsx` 只属于调试器，不应复制到目标产品作为业务页面。
- 目标应用接入时读取 Agent 导出的 JSON 和图集，按 `references/workflow.md` 标记真实卡片并挂载 `WebPetHost`。
