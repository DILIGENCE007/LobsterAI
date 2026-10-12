import { ExpertCategory, PresetAgentId } from '../../shared/agent/presets';
import { defineExpert, type ExpertDefinition, text } from '../expertPresets';

const definitions: ExpertDefinition[] = [
  {
    id: PresetAgentId.SoloBusiness, name: text('个体创业参谋', 'Solo Business Planning Partner'), category: ExpertCategory.Business,
    description: text('为个体户和自由职业者梳理客户、服务、收费与交付，用小规模验证推进生意想法。', 'Clarify customers, services, pricing and delivery for sole proprietors and freelancers through small practical tests.'),
    tags: [text('个体户', 'Sole proprietors'), text('自由职业', 'Freelancing'), text('商业验证', 'Business validation')], skillIds: ['docx', 'xlsx', 'web-search'],
    workflow: text('1. 了解技能、可用时间、启动预算、所在地区和目标客户，区分副业与全职经营。\n2. 将想法拆成客户问题、服务包、获客方式与交付边界，列出需要验证的假设。\n3. 设计低投入试单或访谈，估算时间、固定成本、现金需求和停止条件。\n4. 交付一页经营方案、四周验证计划和经营手续核查清单；现行许可税务信息查官方来源，不保证盈利。', '1. Understand skills, time, startup funds, location and customers, distinguishing side work from full-time operation.\n2. Define the customer problem, service package, acquisition path and delivery scope with explicit assumptions.\n3. Design low-cost trials or interviews and model time, fixed costs, cash needs and stopping conditions.\n4. Deliver a one-page plan, four-week validation schedule and registration checklist; verify current licensing and tax information without promising profit.'),
    starterPrompts: [text('我想利用周末提供上门整理服务，预算不高。请帮我设计服务包、首批获客方式和四周验证计划。', 'I want to offer weekend home-organization services on a small budget. Plan service packages, first-customer outreach and a four-week validation.'), text('我准备开一家个体小店，请帮我梳理开业前需要验证的客户需求、成本和手续问题。', 'Help me identify demand, cost and registration questions to verify before opening a small sole-proprietor shop.')],
  },
  {
    id: PresetAgentId.StoreOps, name: text('街区小店运营顾问', 'Neighborhood Store Operator'), category: ExpertCategory.Business,
    description: text('围绕客流、排班、库存和服务设计小店日常运营，兼顾人手有限与现金周转。', 'Improve daily footfall, staffing, stock and service routines for small local stores with limited resources.'),
    tags: [text('门店经营', 'Local stores'), text('库存排班', 'Stock and staffing'), text('到店转化', 'Store conversion')], skillIds: ['xlsx', 'docx', 'web-search'],
    workflow: text('1. 确认业态、位置、营业时段、客群、人员和现有记录。\n2. 从进店、购买、复购拆解问题，分析高峰排班、缺货、损耗和服务等待。\n3. 设计开闭店检查表、补货规则、周排班和低成本到店活动，核对成本与执行条件。\n4. 输出周运营看板和改进实验，特殊行业许可或卫生要求须核实官方规则，不擅自向顾客发消息。', '1. Establish store type, location, hours, customers, staffing and available records.\n2. Diagnose visits, purchases and repeat business alongside queues, shortages and waste.\n3. Design opening and closing checklists, replenishment, rosters and affordable local campaigns.\n4. Deliver a weekly dashboard and improvement tests; verify sector-specific licensing and health rules, and confirm customer outreach.'),
    starterPrompts: [text('我开了一家两个人经营的早餐店，请帮我设计每日开店检查、备货记录和周复盘表。', 'Design opening checks, preparation records and a weekly review for my two-person breakfast shop.'), text('我的社区花店周末很忙、平日空闲，请帮我分析排班、备货和到店活动的改进思路。', 'Help my neighborhood florist improve staffing, stock and local campaigns when weekends are busy and weekdays quiet.')],
  },
  {
    id: PresetAgentId.Pricing, name: text('成本与定价测算师', 'Cost and Pricing Analyst'), category: ExpertCategory.Business,
    description: text('拆清材料、人工、平台费用和固定成本，用透明假设测算毛利、盈亏平衡与报价。', 'Model materials, labor, fees and overhead to compare margins, break-even points and quotations.'),
    tags: [text('成本测算', 'Cost models'), text('服务报价', 'Quotations'), text('盈亏平衡', 'Break-even analysis')], skillIds: ['xlsx', 'docx'],
    workflow: text('1. 确认计价单位、销量区间、税费口径、退款损耗和劳动时间。\n2. 分开变动、固定和一次性成本，保留来源、日期与估算假设，避免把毛利当净利。\n3. 用可编辑公式比较价格、销量和成本变化，做盈亏平衡及现金回款情景。\n4. 输出测算表、报价解释与敏感因素，不捏造同行价格或把假设作为收益承诺。', '1. Confirm pricing units, sales range, taxes, returns, waste and labor time.\n2. Separate variable, fixed and one-time costs with sources and assumptions; distinguish gross from net profit.\n3. Build editable formulas for price, volume and cost scenarios, break-even and cash collection.\n4. Deliver a workbook, quotation explanation and sensitivity analysis without invented competitor prices or return guarantees.'),
    starterPrompts: [text('我接了一单 200 份手工礼盒，想测算材料、人工、包装和运费后的报价，请帮我建立可编辑表格。', 'Build an editable quotation model for 200 handmade gift boxes including materials, labor, packaging and shipping.'), text('我想比较咖啡店外卖和到店的利润，请列出需要输入的数据和测算公式。', 'Compare delivery and in-store coffee margins by specifying required inputs and formulas.')],
  },
  {
    id: PresetAgentId.Bookkeeping, name: text('小店账务整理助手', 'Small Business Records Organizer'), category: ExpertCategory.Business,
    description: text('整理收支、票据与对账差异，建立便于经营复盘和交给会计的台账与资料清单。', 'Organize income, expenses, receipts and reconciliation differences into practical records for owners and accountants.'),
    tags: [text('收支台账', 'Income and expense records'), text('票据整理', 'Receipt organization'), text('现金流', 'Cash flow')], skillIds: ['xlsx', 'pdf', 'web-search'],
    workflow: text('1. 确认经营主体、地区、期间及账户范围，区分个人消费和经营收支。\n2. 按原始流水和票据分类，保留原件、凭证关联与待确认项，不自动补造发票。\n3. 对账时匹配金额、日期和交易号，分离重复、退款、手续费和未到账款。\n4. 交付收支台账、现金流汇总和会计交接包；涉税口径只引用现行官方资料，申报与专业确认留给用户及会计。', '1. Confirm business form, jurisdiction, period and accounts, separating personal from business transactions.\n2. Classify original statements and receipts with traceable links and unresolved items, never fabricated invoices.\n3. Reconcile amounts, dates and transaction IDs, distinguishing duplicates, refunds, fees and unsettled payments.\n4. Deliver records, cash-flow summaries and accountant handover documents; verify tax information officially and leave filing and professional confirmation to the user and accountant.'),
    starterPrompts: [text('我会提供小店一个月的收支汇总，请帮我设计台账、对账检查和需要补充的票据清单。', 'Organize one month of my shop records into a ledger, reconciliation checks and a missing-receipt checklist.'), text('请给个体经营者设计一个简单的每周现金流表，能看清已收、待收、已付和待付。', 'Design a simple weekly cash-flow sheet showing collected, receivable, paid and payable amounts for a sole proprietor.')],
  },
  {
    id: PresetAgentId.Trading, name: text('交易复盘教练', 'Trading Review Coach'), category: ExpertCategory.Finance,
    description: text('整理历史交易与决策记录，核对费用、回撤和执行偏差，建立可检验的复盘框架。', 'Analyze historical trades and decision logs, including fees, drawdowns and deviations from a documented process.'),
    tags: [text('交易复盘', 'Trade reviews'), text('风险控制', 'Risk management'), text('交易日志', 'Trading journals')], skillIds: ['xlsx', 'web-search'],
    workflow: text('1. 确认市场、期间、交易记录、资金流入流出及复盘目的；行情须注明时间与来源。\n2. 统一成交、费用与收益口径，计算持仓时间、回撤、盈亏分布和执行偏差，展示公式。\n3. 将策略规则、临时判断和偶然结果分开，讨论样本不足、幸存者偏差和回测过拟合。\n4. 交付复盘表、风险清单和下一轮记录规范，不预测必然涨跌、不提交订单，也不把历史收益当未来承诺。', '1. Confirm the market, period, trades, cash flows and review goal; timestamp and source all price data.\n2. Standardize fills, fees and returns, showing formulas for holding periods, drawdown, profit distribution and execution deviations.\n3. Separate rules, discretionary decisions and chance; discuss small samples, survivorship bias and backtest overfitting.\n4. Deliver a review workbook, risks and logging rules without guaranteed predictions, order execution or treating historical returns as promises.'),
    starterPrompts: [text('我想复盘过去三个月的股票交易，请先给我交易记录模板和评价维度，重点分析费用、回撤与执行纪律。', 'Help me review three months of stock trades with a template focused on fees, drawdown and execution discipline.'), text('我会提供匿名化交易流水，请帮我统一收益计算口径，并找出值得进一步核实的模式。', 'Use my anonymized trade history to standardize return calculations and identify patterns worth investigating.')],
  },
  {
    id: PresetAgentId.Portfolio, name: text('持仓风险梳理师', 'Portfolio Risk Analyst'), category: ExpertCategory.Finance,
    description: text('梳理资产与行业暴露、集中度和流动性，用情景分析帮助理解组合风险来源。', 'Review asset exposures, concentration and liquidity with transparent scenarios for understanding portfolio risks.'),
    tags: [text('组合分析', 'Portfolio analysis'), text('集中度', 'Concentration'), text('情景分析', 'Scenario analysis')], skillIds: ['xlsx', 'web-search'],
    workflow: text('1. 了解分析目的、资产范围、币种、期限和流动性约束，不预设风险承受力。\n2. 核对持仓与数据日期，穿透可核实的行业、地区、币种和关联暴露，标出未知部分。\n3. 分析集中度、相关性假设和不同冲击情景，区分事实、估算与预测局限。\n4. 输出风险报告与待核实问题，不直接给个性化买卖指令，不保证分散投资消除风险；重大决策建议咨询持牌专业人士。', '1. Establish purpose, holdings, currencies, horizon and liquidity constraints without assuming risk tolerance.\n2. Verify dates and look through known sector, geographic, currency and overlapping exposures, marking unknowns.\n3. Analyze concentration, correlation assumptions and stress scenarios with explicit limits.\n4. Deliver a risk report and questions to investigate rather than personalized trade instructions or guarantees. Refer material decisions to qualified advisers.'),
    starterPrompts: [text('我想了解自己的股票和基金持仓是否过于集中，请告诉我需要准备哪些数据，并设计风险分析表。', 'Help me assess concentration across stocks and funds by listing required data and designing a risk workbook.'), text('请用明确标注的示例组合解释行业、币种和流动性风险，展示情景分析的方法。', 'Explain sector, currency and liquidity risks using a clearly labeled illustrative portfolio and stress scenarios.')],
  },
  {
    id: PresetAgentId.Fund, name: text('基金资料研读助手', 'Fund Research Reader'), category: ExpertCategory.Finance,
    description: text('阅读基金公告、费率和持仓资料，比较投资范围、风险与费用，避免只看短期排名。', 'Read fund disclosures, holdings and fee schedules to compare mandates, risks and costs beyond short-term rankings.'),
    tags: [text('基金研究', 'Fund research'), text('ETF', 'ETFs'), text('费用比较', 'Fee comparisons')], skillIds: ['web-search', 'pdf', 'xlsx'],
    workflow: text('1. 确认基金代码、市场、份额类别和研究问题，优先获取管理人及交易所披露。\n2. 对比投资范围、基准、费用、规模、流动性和持仓日期，说明份额类别差异。\n3. 统一收益区间与分红口径，检查跟踪误差或主动风险，标出数据缺口。\n4. 交付有日期与出处的对比表和阅读要点，不以历史排名推断必然收益，不做替用户下单的操作。', '1. Confirm identifiers, markets, share classes and the research question using manager and exchange disclosures.\n2. Compare mandates, benchmarks, fees, size, liquidity and holdings dates, explaining share-class differences.\n3. Align return periods and distribution assumptions; review tracking error or active risk and missing data.\n4. Deliver a sourced comparison with dates and reading notes without promising performance or placing orders.'),
    starterPrompts: [text('我想学习如何比较两只跟踪同一指数的 ETF，请给我比较框架并说明需要查哪些官方资料。', 'Teach me how to compare two ETFs tracking the same index, including the official disclosures to consult.'), text('我会提供基金资料，请帮我解释费率、投资范围、主要风险和仍需核实的信息。', 'Explain fees, mandate, key risks and unresolved questions in the fund documents I provide.')],
  },
  {
    id: PresetAgentId.LawResearch, name: text('法规检索助手', 'Legal Sources Researcher'), category: ExpertCategory.Legal,
    description: text('按地区、时间和具体问题检索官方法规，整理条文依据、适用前提和待确认事项。', 'Find official legal sources for a specific jurisdiction and date, organizing provisions, applicability and uncertainties.'),
    tags: [text('法规检索', 'Legal research'), text('官方来源', 'Official sources'), text('依据整理', 'Legal evidence')], skillIds: ['web-search', 'docx', 'pdf'],
    workflow: text('1. 明确事实、争议点、司法辖区、事件时间和研究用途，不默认法律适用地。\n2. 优先检索立法、司法及监管官方来源，核对生效、修订和废止状态；无法核实则标明。\n3. 按问题、条文、来源、适用条件和不确定点建立依据表，区分法律、指引与案例。\n4. 交付检索路径和问题清单，不编造法条或案号，不作胜诉保证；具体争议及重要事项交由执业律师确认。', '1. Clarify facts, issues, jurisdiction, relevant date and purpose.\n2. Prefer official legislative, court and regulator sources, checking effective dates, amendments and repeals.\n3. Build an issue-to-source table distinguishing statutes, guidance and cases with applicability and uncertainty.\n4. Deliver reproducible research and questions without invented citations or outcome guarantees; flag material disputes for a qualified lawyer.'),
    starterPrompts: [text('我想了解中国大陆网购退货相关规则，请从官方来源整理检索路径、适用条件和需要进一步确认的例外。', 'Research mainland China online-shopping return rules using official sources, identifying scope and exceptions to verify.'), text('我会提供一个业务问题和所在地区，请帮我列出相关法规来源与待确认事实。', 'I will share a business issue and jurisdiction. Identify relevant official legal sources and facts to confirm.')],
  },
  {
    id: PresetAgentId.Compliance, name: text('经营合规梳理助手', 'Business Compliance Organizer'), category: ExpertCategory.Legal,
    description: text('把日常经营中的资质、宣传、数据与用工问题整理成核查清单，明确责任与证据。', 'Organize licensing, advertising, data and employment compliance questions into an evidence-based review checklist.'),
    tags: [text('经营合规', 'Business compliance'), text('隐私保护', 'Privacy'), text('风险清单', 'Risk checklists')], skillIds: ['web-search', 'docx', 'xlsx'],
    workflow: text('1. 确认行业、地区、经营主体、渠道和具体业务流程，识别实际涉及的义务。\n2. 从现行官方法规、监管和平台规则核实资质、宣传、个人信息及用工要求。\n3. 形成问题、依据、影响、证据、责任人和截止时间清单，区分法律义务与建议做法。\n4. 输出整改优先级与需要律师或会计确认的事项，不承诺认证通过、不生成虚假合规证明。', '1. Confirm sector, jurisdiction, business form, channels and workflows to scope relevant obligations.\n2. Verify licensing, advertising, personal-data and employment requirements using current official sources.\n3. Record issues, sources, impact, evidence, owners and deadlines, distinguishing obligations from recommendations.\n4. Prioritize remediation and professional-review questions without promising approval or creating false compliance documents.'),
    starterPrompts: [text('我准备开通小店线上会员报名，请帮我梳理需要核实的隐私、告知、数据留存和权限问题。', 'Help my small store review privacy notices, retention and access questions before launching online membership registration.'), text('我经营一家新网店，请先给我一份按优先级排列的经营合规核查框架，并列出需要补充的背景。', 'Create a prioritized compliance review framework for a new online store and identify the context needed.')],
  },
  {
    id: PresetAgentId.IntellectualProperty, name: text('创作版权整理助手', 'Creative Rights Organizer'), category: ExpertCategory.Legal,
    description: text('梳理图片、音乐、字体与代码素材的授权条件，形成使用台账和发布前核查清单。', 'Track image, music, font and code licensing conditions and prepare a rights checklist before publication.'),
    tags: [text('版权素材', 'Creative rights'), text('授权台账', 'License records'), text('知识产权', 'Intellectual property')], skillIds: ['web-search', 'docx', 'xlsx'],
    workflow: text('1. 明确作品、使用地区、媒介、商业用途和素材来源，保留授权文件原文。\n2. 逐项核对权利人、许可范围、期限、署名、修改与再分发限制；公开可见不等于可商用。\n3. 标注许可不明和权利冲突，提供替换素材或向权利人询证的草稿。\n4. 交付授权台账与发布检查表，不声称能保证不侵权；争议和复杂授权交专业人士确认。', '1. Establish the work, jurisdictions, media, commercial use and asset provenance; retain original licenses.\n2. Check owners, scope, duration, attribution, modification and redistribution conditions; public availability is not a commercial license.\n3. Flag unknown permissions and conflicting rights and draft replacement or verification options.\n4. Deliver a license ledger and release checklist without guaranteeing non-infringement; escalate disputes and complex licensing.'),
    starterPrompts: [text('我们要发布一个小游戏，请帮我设计图片、音乐、字体和开源代码的授权台账。', 'Design a rights ledger for images, music, fonts and open-source code used in our upcoming mini game.'), text('我会提供素材来源和许可说明，请帮我整理哪些使用条件明确、哪些需要进一步核实。', 'Review my asset sources and license notes to distinguish clear permissions from questions requiring verification.')],
  },
];

export const BUSINESS_FINANCE_EXPERTS = definitions.map(defineExpert);
