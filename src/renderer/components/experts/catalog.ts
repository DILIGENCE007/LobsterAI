import { ExpertCategory, type LocalizedExpertText, type PresetAgent,PresetAgentId } from '@shared/agent/presets';

export const EXPERT_CATEGORY_LABELS: Record<ExpertCategory, string> = {
  [ExpertCategory.Campus]: 'expertCategoryCampus',
  [ExpertCategory.Work]: 'expertCategoryWork',
  [ExpertCategory.Office]: 'expertCategoryOffice',
  [ExpertCategory.Content]: 'expertCategoryContent',
  [ExpertCategory.Marketing]: 'expertCategoryMarketing',
  [ExpertCategory.Ecommerce]: 'expertCategoryEcommerce',
  [ExpertCategory.Business]: 'expertCategoryBusiness',
  [ExpertCategory.Engineering]: 'expertCategoryEngineering',
  [ExpertCategory.Games]: 'expertCategoryGames',
  [ExpertCategory.Design]: 'expertCategoryDesign',
  [ExpertCategory.Research]: 'expertCategoryResearch',
  [ExpertCategory.Finance]: 'expertCategoryFinance',
  [ExpertCategory.Legal]: 'expertCategoryLegal',
  [ExpertCategory.Learning]: 'expertCategoryLearning',
  [ExpertCategory.Life]: 'expertCategoryLife',
};

export const EXPERT_SCENARIOS = [
  { titleKey: 'expertScenarioCampus', descriptionKey: 'expertScenarioCampusDesc',
    className: 'from-teal-500/[0.08] to-emerald-500/[0.02]',
    ids: [PresetAgentId.CampusCareer, PresetAgentId.Academic, PresetAgentId.CampusEvent] },
  { titleKey: 'expertScenarioCreate', descriptionKey: 'expertScenarioCreateDesc',
    className: 'from-orange-500/[0.08] to-amber-500/[0.02]',
    ids: [PresetAgentId.Douyin, PresetAgentId.Xiaohongshu, PresetAgentId.Bilibili] },
  { titleKey: 'expertScenarioFinance', descriptionKey: 'expertScenarioFinanceDesc',
    className: 'from-indigo-500/[0.08] to-blue-500/[0.02]',
    ids: [PresetAgentId.Stock, PresetAgentId.Trading, PresetAgentId.Portfolio] },
  { titleKey: 'expertScenarioLegal', descriptionKey: 'expertScenarioLegalDesc',
    className: 'from-stone-500/[0.08] to-amber-500/[0.02]',
    ids: [PresetAgentId.Contract, PresetAgentId.LawResearch, PresetAgentId.Compliance] },
  { titleKey: 'expertScenarioBusiness', descriptionKey: 'expertScenarioBusinessDesc',
    className: 'from-amber-500/[0.08] to-orange-500/[0.02]',
    ids: [PresetAgentId.SoloBusiness, PresetAgentId.StoreOps, PresetAgentId.Pricing] },
  { titleKey: 'expertScenarioOffice', descriptionKey: 'expertScenarioOfficeDesc',
    className: 'from-sky-500/[0.08] to-indigo-500/[0.02]',
    ids: [PresetAgentId.Word, PresetAgentId.Excel, PresetAgentId.Slides] },
  { titleKey: 'expertScenarioBuild', descriptionKey: 'expertScenarioBuildDesc',
    className: 'from-blue-500/[0.08] to-sky-500/[0.02]',
    ids: [PresetAgentId.MiniApp, PresetAgentId.Developer, PresetAgentId.Designer] },
  { titleKey: 'expertScenarioGames', descriptionKey: 'expertScenarioGamesDesc',
    className: 'from-violet-500/[0.08] to-fuchsia-500/[0.02]',
    ids: [PresetAgentId.WechatGame, PresetAgentId.DouyinGame, PresetAgentId.GameLaunch] },
  { titleKey: 'expertScenarioUnderstand', descriptionKey: 'expertScenarioUnderstandDesc',
    className: 'from-emerald-500/[0.08] to-teal-500/[0.02]',
    ids: [PresetAgentId.Data, PresetAgentId.Reporting, PresetAgentId.Visualization] },
  { titleKey: 'expertScenarioCommerce', descriptionKey: 'expertScenarioCommerceDesc',
    className: 'from-rose-500/[0.08] to-orange-500/[0.02]',
    ids: [PresetAgentId.Campaign, PresetAgentId.Listing, PresetAgentId.EcommerceOps] },
  { titleKey: 'expertScenarioCareer', descriptionKey: 'expertScenarioCareerDesc',
    className: 'from-cyan-500/[0.08] to-blue-500/[0.02]',
    ids: [PresetAgentId.Resume, PresetAgentId.Interview, PresetAgentId.JobSearch] },
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
