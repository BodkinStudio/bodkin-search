import { collect, eraseContext } from "./AnalyticsCollection";
import { recordOutcome } from "./AnalyticsOutcomes";
import { AnalyticsQueries } from "./AnalyticsQueries";
import {
  createSource,
  listSources,
  saveSettings,
  health,
  purgeExpired,
  deliverOutbox,
  eraseCustomer,
} from "./AnalyticsOperations";
import { AnalyticsRepository } from "./AnalyticsRepository";
import { mqlReport } from "./AnalyticsMqls";
export const AnalyticsService = {
  collect,
  eraseContext,
  recordOutcome,
  ...AnalyticsQueries,
  createSource,
  listSources,
  saveSettings,
  health,
  purgeExpired,
  deliverOutbox,
  eraseCustomer,
  settings: AnalyticsRepository.settings,
  mqls: mqlReport,
};
