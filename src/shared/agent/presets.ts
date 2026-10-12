export const ExpertCategory = {
  Campus: 'campus',
  Work: 'work',
  Office: 'office',
  Content: 'content',
  Marketing: 'marketing',
  Ecommerce: 'ecommerce',
  Business: 'business',
  Engineering: 'engineering',
  Games: 'games',
  Design: 'design',
  Research: 'research',
  Finance: 'finance',
  Legal: 'legal',
  Learning: 'learning',
  Life: 'life',
} as const;
export type ExpertCategory = typeof ExpertCategory[keyof typeof ExpertCategory];

export const PresetAgentId = {
  Stock: 'stockexpert',
  Writer: 'content-writer',
  Teacher: 'lesson-planner',
  Summarizer: 'content-summarizer',
  Health: 'health-interpreter',
  Pet: 'pet-care',
  MiniApp: 'miniapp-advisor',
  Developer: 'app-builder',
  Designer: 'interface-designer',
  Wechat: 'wechat-editor',
  Social: 'social-content-planner',
  Data: 'data-advisor',
  Product: 'product-planner',
  Researcher: 'industry-researcher',
  Career: 'career-coach',
  Contract: 'contract-reader',
  Presentation: 'presentation-planner',
  Academic: 'academic-writing-coach',
  CampusCareer: 'campus-career-guide',
  CampusEvent: 'campus-event-planner',
  CampusClub: 'student-club-partner',
  Scholarship: 'scholarship-application-guide',
  Study: 'study-planning-coach',
  Resume: 'resume-editor',
  Interview: 'interview-practice-coach',
  JobSearch: 'job-search-planner',
  Douyin: 'douyin-content-planner',
  Xiaohongshu: 'xiaohongshu-editor',
  Bilibili: 'bilibili-video-planner',
  Storyboard: 'video-storyboard-editor',
  Campaign: 'marketing-campaign-planner',
  BrandCopy: 'brand-copy-editor',
  Seo: 'search-content-planner',
  Community: 'customer-community-planner',
  Listing: 'product-listing-editor',
  EcommerceOps: 'ecommerce-operations-analyst',
  LiveCommerce: 'live-commerce-planner',
  CrossBorder: 'cross-border-store-guide',
  CustomerSupport: 'customer-service-designer',
  SoloBusiness: 'solo-business-planner',
  StoreOps: 'local-store-operations-guide',
  Pricing: 'cost-pricing-analyst',
  Bookkeeping: 'small-business-bookkeeping-guide',
  Trading: 'trading-review-coach',
  Portfolio: 'portfolio-risk-analyst',
  Fund: 'fund-research-guide',
  LawResearch: 'legal-source-researcher',
  Compliance: 'business-compliance-guide',
  IntellectualProperty: 'creative-rights-guide',
  Backend: 'api-backend-builder',
  Testing: 'software-test-planner',
  Automation: 'workflow-automation-builder',
  WechatGame: 'wechat-mini-game-builder',
  DouyinGame: 'douyin-mini-game-builder',
  IndieGame: 'indie-game-prototype-partner',
  GameLaunch: 'game-release-guide',
  Word: 'word-document-editor',
  Excel: 'excel-workbook-builder',
  Slides: 'powerpoint-deck-builder',
  Reporting: 'business-report-builder',
  Visualization: 'data-visualization-designer',
  Sql: 'sql-analysis-partner',
} as const;

export const ExpertUiEvent = {
  OpenPlaza: 'experts:open-plaza',
} as const;

export interface LocalizedExpertText {
  zh: string;
  en: string;
}

export interface ExpertDiscovery {
  category: ExpertCategory;
  tags: LocalizedExpertText[];
  starterPrompts: LocalizedExpertText[];
}

export interface PresetAgent extends ExpertDiscovery {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  identity: string;
  identityEn: string;
  systemPrompt: string;
  systemPromptEn: string;
  skillIds: string[];
  installed?: boolean;
}
