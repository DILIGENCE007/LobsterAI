# 专家与任务链路埋点口径

本次沿用 `rlog → wisdom`，补充专家发现、草稿、任务运行、能力调用与产物使用的关联数据。新增事件使用 `schemaVersion=1`；不改变现有事件的名称和业务含义，不增加持久队列、重试或数仓写入。

## 事件与指标

| action | stage 或现有操作字段 | 可回答的问题 |
| --- | --- | --- |
| `lobsterai_expert_journey` | `view / load / filter / impression / detail / summon / draft` | 是否进入广场、目录能否加载、搜索是否无结果、哪些专家被看到、查看、召唤并进入草稿 |
| 同上 | `catalog_refresh / prepare` | 目录刷新是否失败并使用缓存；专家是安装、复用还是重新启用；是否卡在目录处理或 OpenClaw 配置同步 |
| `lobsterai_task_lifecycle` | `submit / start / first_response / permission / permission_decision / end` | 提交是否被接收、运行是否开始、首响应耗时、权限等待与选择、结束原因 |
| `lobsterai_capability_use` | `select / start / end` | 实际提交了哪些 skill、kit；工具和 MCP 是否调用、失败或中断；是否读取了已安装 skill 的入口文件 |
| `lobsterai_media_lifecycle` | `view / select / login / subscribe` | 用户能否进入媒体能力，是否被登录、权益、企业账号上下文或额度状态阻挡 |
| 同上 | `start / confirmation / accepted / generated / saved` | 是否等待用户确认、用户是否取消、请求是否受理、异步生成是否结束、结果是否完整保存到本地 |
| `lobsterai_artifact_delivery` | `discovered` | 本次渲染进程中提交的任务，其产物是否被客户端识别 |
| `lobsterai_artifact_preview_action` | 保留现有 `actionType`，补充关联字段 | 产物是否被打开、复制、导出、分享，以及相关失败 |

`filter` 仅发送查询长度、分类 ID、是否选择标签和结果数；不发送搜索文本。专家曝光要求卡片至少 50% 进入可见区域；同一广场访问、目录版本、专家与推荐场景组合只计一次，不能用目录条目数当曝光量。推荐区域记录 `scenarioId`，示例问题记录零起始的 `starterIndex`，不记录正文。

召唤成功表示专家实例准备成功；`draft` 表示准备了未发送的草稿。两者均不能当作专家已被使用。`prepareMode=install/reuse/reenable` 来自主进程实例检查。专家排行建议分别展示曝光 UV、召唤 UV、运行 UV、运行次数、后续再次运行 UV，而不是合成一个“热度”计数。

## 关联与去重

- `eventId`：每条上报的唯一 ID，主进程补齐此字段以及 `environment`。明细分析先按 `eventId` 去重，再按业务 ID 计算转化。
- `journeyId`：广场访问或已安装专家选择产生的随机 ID；草稿提交后传入任务链路。
- `taskId / turnId`：独立生成的随机分析 ID，与本地 session/message ID 不同。每次提交生成新的 `turnId`，续聊恢复已持久化的 `taskId`。
- `presetId`：专家目录的稳定 ID，取实际 agent 的 preset 归属；自定义 agent 不冒充专家。`catalogVersion` 表示本次发现专家时看到的目录版本，不表示用户修改后的专家内容版本。
- `callId`：本轮工具调用的随机分析 ID。流式更新和重复结果只产生一次完成事件。
- `mediaJobId`：独立于服务端任务 ID 的随机 ID。显式查询状态与后台轮询共享去重记录，异步完成沿用提交时的上下文。
- `artifactId`：渲染进程内用于关联产物发现与交互的随机 ID。重启后不保证相同；没有可靠的产生消息时发送 `attributionKnown=false`，不挂到最新一轮任务。

任务上下文存放在现有消息 metadata 的 `usageAnalytics` 中，无需数据库迁移。`ownerKey / localSessionId` 只用于本地账号核对和隔离分叉会话，经过白名单读取后不会进入上报参数。关闭统计时不启动新追踪；账号变化后的在途结果不会归到新账号。新增逻辑失败不会阻断任务或专家准备。

MCP 和用户自定义工具、skill 标识采用安装范围内加盐摘要，不发送自定义名称、工具参数、错误原文、服务端任务 ID、提示词、文件路径或产物内容。内置工具名使用固定白名单，官方 skill 允许使用目录 ID。新增逻辑不改变旧事件已有字段。

## 成功与受阻的判定

`task_lifecycle.end` 的 `completed` 只说明本轮运行结束；`completed_with_tool_errors` 表示本轮出现过工具错误。其他结束状态包括 `failed / cancelled / timeout`。这些都不是用户满意度标签。没有结束事件的任务应归为“结果未知”，可能包含客户端退出、网络失败或丢报，不能直接算失败。

工具 `succeeded` 仅表示工具没有返回错误；`skill_load` 表示读取了已安装的 `SKILL.md`，不能证明后续完全执行了 skill。kit 的 `select` 表示随任务提交的能力集合，不能从一次 kit 选择推断整套工作流成功。首响应时间从客户端运行调度开始，到首次 assistant 或工具消息，包含本地准备时间。

媒体 `accepted` 与 `generated` 分开统计。视频确认弹窗用 `confirmation/requested` 和 `confirmation/allowed或denied` 记录，后者的 `durationMs` 是等待用户决定的时间；其他媒体阶段的 `durationMs` 仍从请求开始累计。分析受理耗时时应扣除确认等待，不能将用户停留视作服务端延迟。`saved` 要求保存数量等于预期数量且大于零才算成功；部分保存使用 `partial=true`。产物 `discovered` 只是客户端识别，不证明文件可读或用户采用；结合预览、打开、复制、导出或分享事件判断后续使用。

权限 `permission/requested` 到 `permission/resolved` 的间隔表示等待时间；`permission_decision` 表示用户选择 allow/deny，不代表运行时已接收选择。失败原因经过固定分类，无法确定时使用 `unknown`。旧的 `prompt_control_action/submit_blocked` 继续提供模型、配额等提交前阻挡信息，并补充当前专家草稿归因。

## 旧模板与其他能力的兼容

`lobsterai_expert_kit_action`、`lobsterai_expert_kit_selected` 继续表示 kit；不重命名、不作为专家事件合并。旧 agent 模板行为仍保留原有历史含义。以前没有保存 `presetId` 的自定义 agent 不按名称或提示词反推专家，历史数据不能强行补成新专家漏斗。

已有 skill、kit、MCP 管理页安装、配置、启停事件继续使用；本次补上 kit 页签切换、随任务提交的能力及运行时工具调用。桌面发起的任务和已接入的 IM 用户回合纳入运行观察；不对无法确认起点的历史导入、后台恢复或计划任务补造开始事件。

## 数仓验收与分析

预研已用只读查询在 `hive.dso.wisdom` 看到现有 `lobsterai_` 上报，因此可用它检查发布后的新事件是否入库和日事件量。现有 `userid` 是 rlog 侧标识，不能当作客户端登录账号；账号 UV 需待 `user_id` 字段入库后计算。该表当前可查询字段不包含 `presetId / stage / taskId / turnId / environment / app_version` 等业务明细，不能仅靠 DSO 产出完整专家排行和漏斗。

`hive.outlog.wisdom` 有 `kv` 明细结构，但当前 Trino 查询受到 `SymlinkReqLogInputFormat` 不支持的限制。需要数仓提供可读的明细表或兼容查询入口；本次不修改数仓。下面的第二段 SQL 是明细契约模板，只有确认真实明细表及字段映射后才能执行。

```sql
-- DSO 入库检查：按上线后的实际分区替换日期。
SELECT day, action, count(*) AS event_count
FROM hive.dso.wisdom
WHERE day = '2026-10-14'
  AND action IN (
    'lobsterai_expert_journey', 'lobsterai_task_lifecycle',
    'lobsterai_capability_use', 'lobsterai_media_lifecycle',
    'lobsterai_artifact_delivery'
  )
GROUP BY day, action;
```

明细需暴露至少 `eventId, action, stage, outcome, user_id, uuid, environment, app_version, uts, presetId, journeyId, taskId, turnId`；其余维度使用同名 kv 字段。生产指标筛选 `environment=production` 和明确的应用版本范围，账号 UV 与安装 UV 分开定义。

```sql
-- 待数仓映射的规范化明细视图模板，analytics_usage_events 不是已存在的表。
WITH dedup AS (
  SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY event_time) AS rn
  FROM analytics_usage_events
  WHERE environment = 'production' AND day BETWEEN :start_day AND :end_day
), runs AS (
  SELECT preset_id, user_id, task_id, turn_id,
         max(CASE WHEN stage = 'start' THEN 1 ELSE 0 END) AS started,
         max(CASE WHEN stage = 'end' AND outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
         max(CASE WHEN stage = 'end' AND outcome IN ('failed', 'timeout') THEN 1 ELSE 0 END) AS failed
  FROM dedup
  WHERE rn = 1 AND action = 'lobsterai_task_lifecycle' AND preset_id IS NOT NULL
  GROUP BY preset_id, user_id, task_id, turn_id
)
SELECT preset_id, count(DISTINCT CASE WHEN started = 1 THEN user_id END) AS run_uv,
       sum(started) AS runs, sum(completed) AS completed_runs, sum(failed) AS failed_runs
FROM runs GROUP BY preset_id;
```

完整漏斗按 `journeyId + presetId` 对齐可见曝光、详情、召唤、草稿和首次启动，再按 `taskId + turnId` 关联工具、媒体及产物；按时间顺序和明确的转化窗口计算。对直接选用已安装专家的入口单独建漏斗，不能要求它先有广场曝光。复用可按用户与专家，在首次启动后的其他任务或后续日期出现新启动计算，区分续聊和再次新建任务。

## 上线后的核验边界

自动化测试验证端侧事件与关联字段。Hive 延迟入库、ETL 对新增字段的保留和生产丢报率需要上线后检查。当前发送仍为 best effort；主进程并发上限、网络失败、客户端退出或不可用的安装标识都可能造成数据缺口。本次没有增加可靠投递承诺。
