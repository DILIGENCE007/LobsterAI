export const ExpertCategory = {
  Work: 'work',
  Content: 'content',
  Engineering: 'engineering',
  Design: 'design',
  Research: 'research',
  Finance: 'finance',
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
