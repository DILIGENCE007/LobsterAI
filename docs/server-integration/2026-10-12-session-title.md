# 免费会话标题生成

## 变更摘要

服务端新增 `POST /api/desktop-tools/session-title`，使用服务端已有 `deepseek-flash` 配置生成简短会话标题。需要登录，无订阅门槛，不扣免费、订阅或其他积分。标题次数独立于翻译和 TTS，按账号合并多设备、多实例用量。

开发基线：服务端 `main`（`dfbd95ba`）；桌面端 `release/2026.9.24`（`46697feb6`）。两个项目均在独立 worktree 的 `feat/session-title` 分支开发。

## 接口

```http
POST /api/desktop-tools/session-title
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "requestId": "23f8ed06-69c8-42d4-a709-7ee209842a17",
  "text": "请整理下周项目发布计划\n发布需求.docx"
}
```

`requestId` 使用本地正式会话 UUID，同一会话保持相同 ID；重复请求不会重复调用模型。只支持标准小写 UUID。`text` 是最多 1,000 个 Unicode 字符的纯文本；空白或超长输入在调用上游、计次前拒绝。客户端不能覆盖模型、系统提示词、思考参数、工具、消息列表或输出上限；其他 JSON 字段不会传给上游。

成功返回普通 JSON，不使用 SSE，并设置 `Cache-Control: no-store`：

```json
{
  "code": 0,
  "message": "success",
  "data": { "title": "下周项目发布计划" }
}
```

标题跟随提问主要语言，最多 50 个 Unicode 字符。服务端固定 `model=deepseek-flash`、`stream=false`、`max_tokens=64`、`temperature=0`、`thinking={"type":"disabled"}`，只发送固定系统提示和一条用户文本，不提供工具。空结果、多行、控制字符、超长、截断结果或含思考内容的响应都按失败处理。

模型参数依据 [DeepSeek Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)；模型标识与关闭思考行为已经通过真实测试配置调用核对。

沿用桌面工具错误码：

| 错误码 | 含义 |
| --- | --- |
| 42500 | 功能关闭，或模型/路由配置不可用 |
| 42501 | 无效 UUID、空文本等输入问题 |
| 42502 | 输入超过 1,000 字符 |
| 42503 | 当日标题次数耗尽 |
| 42504 | 每分钟次数耗尽 |
| 42505 | 重复 requestId |
| 42506 | 上游失败、5 秒超时或输出无效 |

鉴权错误继续使用既有 401/401xx 体系。客户端检查 HTTP 状态与业务 `code`；所有失败均静默保留现有标题。

## 桌面端接入

- 仅用户主动新建的桌面会话触发，适用于所有 Agent。IM、定时任务、分叉、历史会话和后续轮次不触发。
- 先用既有本地标题创建会话，正式会话创建成功并完成临时会话替换后，异步请求一次。取消创建时不请求，不等待生成结果再发送首轮对话。
- 标题文本在输入组件中从原始提问提取，移除 `/goal start/set/create` 前缀，附加最多 3 个非图片附件名称，每个名称最多 80 字符，合计截断至 1,000 字符。文件名去掉目录，只带名称；不读取文件本体，不发送图片、系统提示、对话历史、引用全文或浏览器截图。只有图片且无有效文字时跳过；纯文档可使用文档名称。
- 请求经专用 IPC 在主进程发起，使用现有登录令牌，独立于当前会话模型。绕开鉴权刷新/重试包装器，不触发登录提示，不做上游重试或供应商切换。
- 客户端整体请求、服务端上游调用均限制为 5 秒。接口失败、超额、超时、未登录及异常输出都保留原标题，不展示错误，不补发、不重试。
- 返回前再次检查会话存在、账号仍相同、标题未被修改。手动改名会取消正在生成的标题，即使用户保存的名字恰好等于原名也不会被覆盖。
- 标题写入现有 SQLite 会话记录，更新 Redux 列表及当前会话，不更新会话 `updatedAt`，因此不因标题生成改变列表排序。

## 服务端额度与配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DESKTOP_TITLE_ENABLED` | `true` | 标题功能开关 |
| `DESKTOP_TITLE_DAILY_REQUESTS` | `100` | 每账号每日次数，订阅与非订阅相同 |
| `DESKTOP_TOOLS_REQUESTS_PER_MINUTE` | `20` | 复用工具限速配置，各工具分别计数 |
| `DESKTOP_TOOLS_ENABLED` | `true` | 桌面工具总开关，关闭时标题同样不可用 |

次数按北京时间自然日计数，零点重置。写库行锁原子准入防止并发超限。标题在发起上游调用前预占次数，实际发起后即使失败/超时也不退次；此规则与翻译、TTS 的失败退款规则不同。输入/鉴权/配置校验失败不计次。结算异常保留预占，不补发上游调用。

复用 `desktop_tool_daily_usage`、`desktop_tool_call_logs`，工具标识为 `session_title`，无需新增表或 DDL。`GET /api/desktop-tools/quota` 的 `data.tools` 新增 `session_title`，原有翻译与朗读字段不变。日志表只记录哈希、字符数量、状态与耗时等，不保存提问或标题文本。

## 发布与兼容

1. 确认现有桌面工具 V102/V103 表结构已就绪，`model_pricing` 中 `deepseek-flash` 已启用且为 OpenAI 格式，有有效地址和服务端密钥。
2. 存在启用的模型路由时，按现有策略选择第一条；没有路由时使用模型默认配置。调用失败不尝试其他路由。
3. 先发布服务端，再发布桌面端。新客户端连接旧服务端时遇到 404 会静默保留本地标题；旧客户端不受新增接口影响。
4. 不新增用户设置或额度提示 UI，无历史标题回填、重试队列或模型调用补偿。

## 验证方式与记录

服务端单元测试：

```powershell
.\gradlew.bat test --tests '*desktoptools.*' --console=plain
```

真实 MySQL、正式 MyBatis 路由配置及完整 test-profile HTTP 服务验收：

```powershell
$env:SESSION_TITLE_DATABASE_TEST='true'
.\gradlew.bat envIntegrationTest --tests '*SessionTitleDatabaseIntegrationTest' --console=plain
```

以上默认使用本地可控上游验证额度和失败路径；额外核验真实模型时设置 `SESSION_TITLE_LIVE_MODEL_TEST=true`。真实调用检查严格保留 5 秒超时，不重试，可能因上游波动而失败。

验收仅允许指定测试 MySQL 主机，创建随机 `session_title_<12位随机值>` 数据库，复制已部署表结构和必要模型/套餐配置；所有账号、订阅和额度写入都发生在隔离库。禁用无关定时任务，结束时删除隔离库。测试断言 `mapUnderscoreToCamelCase=false`、正式 `RouterInterceptor`，并验证持久化计数和业务结果。

端侧回归：

```powershell
npm test -- src/common/sessionTitle.test.ts src/main/libs/sessionTitleGenerator.test.ts src/renderer/services/coworkSessionTitle.test.ts src/renderer/services/coworkPromptPayload.test.ts src/renderer/store/slices/coworkSlice.test.ts
npm run compile:electron
npm run build
```

2026-10-12 已观察到真实 DeepSeek Flash 返回“下周项目发布计划整理”，两次上游耗时分别为 1,884 ms、1,534 ms；另一次触发 5 秒超时并返回失败，无重试。Windows Electron 43.5.0 的独立沙箱窗口已验证真实 preload → IPC → HTTP → SQLite 链路、最小输入、排序时间不变、手动改名/删除/切换账号保护、503 静默失败和未登录跳过。

测试库实际版本为 MySQL `5.7.33-36-log`，额度表使用 `BIGINT AUTO_INCREMENT` 主键及原有业务唯一索引；`tool` 为 `VARCHAR(16)`、`utf8mb4_unicode_ci`，可直接存储 `session_title`。生产只读连接超时，尚未核验生产模型配置与表定义；本次没有修改共享测试库或生产数据。

最终验证结果：服务端 21 项单元测试通过；完整 MySQL/HTTP 额度验收通过，6 个并发请求竞争 2 次额度时仅准入 2 个，上游失败保留计次，付费/免费用户限额相同且不产生积分扣费记录。隔离库 `session_title_2945ba8c7470` 已删除。真实模型检查作为独立可选测试保留，默认验收不依赖公网模型稳定性。

端侧相关回归共 76 项通过，变更 TypeScript 文件严格 ESLint 通过；主进程及渲染进程类型检查通过。全量 `npm run build` 已通过前置资产检查和 TypeScript 阶段，但 Vite 依赖转换超过 10 分钟仍未完成，因此停止了本任务的额外打包进程；未验证完整生产打包，未生成安装包。没有变更或终止其他工作目录的构建。
