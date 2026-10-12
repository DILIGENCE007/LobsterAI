import { ExpertCategory, type LocalizedExpertText, type PresetAgent,PresetAgentId } from '@shared/agent/presets';

export const EXPERT_CATEGORY_LABELS: Record<ExpertCategory, string> = {
  [ExpertCategory.Work]: 'expertCategoryWork',
  [ExpertCategory.Content]: 'expertCategoryContent',
  [ExpertCategory.Engineering]: 'expertCategoryEngineering',
  [ExpertCategory.Design]: 'expertCategoryDesign',
  [ExpertCategory.Research]: 'expertCategoryResearch',
  [ExpertCategory.Finance]: 'expertCategoryFinance',
  [ExpertCategory.Learning]: 'expertCategoryLearning',
  [ExpertCategory.Life]: 'expertCategoryLife',
};

export const EXPERT_SCENARIOS = [
  { titleKey: 'expertScenarioCreate', descriptionKey: 'expertScenarioCreateDesc',
    className: 'from-orange-500/[0.08] to-amber-500/[0.02]',
    ids: [PresetAgentId.Wechat, PresetAgentId.Social, PresetAgentId.Presentation] },
  { titleKey: 'expertScenarioBuild', descriptionKey: 'expertScenarioBuildDesc',
    className: 'from-blue-500/[0.08] to-sky-500/[0.02]',
    ids: [PresetAgentId.MiniApp, PresetAgentId.Developer, PresetAgentId.Designer] },
  { titleKey: 'expertScenarioUnderstand', descriptionKey: 'expertScenarioUnderstandDesc',
    className: 'from-emerald-500/[0.08] to-teal-500/[0.02]',
    ids: [PresetAgentId.Data, PresetAgentId.Researcher, PresetAgentId.Stock] },
] as const;

export function expertText(value: LocalizedExpertText, language: string): string {
  return language === 'en' ? value.en : value.zh;
}

export function filterExperts(
  presets: PresetAgent[],
  query: string,
  category: ExpertCategory | null,
  tag: string | null,
): PresetAgent[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return presets.filter(preset => {
    if (category && preset.category !== category) return false;
    if (tag && !preset.tags.some(item => item.zh === tag)) return false;
    const searchable = [preset.name, preset.nameEn, preset.description, preset.descriptionEn,
      ...preset.tags.flatMap(item => [item.zh, item.en])].join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
