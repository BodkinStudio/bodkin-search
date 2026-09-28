# Backend ownership and client contract

Own only new/changed backend/type files and their tests: GrowthPriorityPageCheckService; new GrowthInvestigationTemplate / GrowthInvestigationsService; narrow GrowthActions/Insights repository queries if needed; src/serverFunctions/growthInvestigations.ts; src/types/schemas/growth-investigations.ts. Do not change UI, docs or control-plane files.

Exports in growth-investigations.ts:

- GrowthInvestigationView: recommendationId, title, rationale, steps:string[], displayUrls:(string|null)[], status (existing Recommendation status type), actionId:string|null, dueOn:string|null, templateVersion:string.
- GrowthWorkItem: id, title, status (existing Action status type), dueOn:string|null, createdAt:string, runId:string, displayUrls:(string|null)[].
- GrowthWorkOverview: actions:GrowthWorkItem[], limit:number.
- Strict read inputs {projectId,signalId} and {projectId}; approval {projectId,signalId,dueOn} with valid real YYYY-MM-DD date. Do not reject merely overdue dates; work may be entered late. Reuse an existing calendar validator if available.

Server functions:

- getGrowthInvestigation({data:{projectId,signalId}}) -> GrowthInvestigationView | null
- approveGrowthInvestigation({data:{projectId,signalId,dueOn}}) -> GrowthWorkItem
- getGrowthWork({data:{projectId}}) -> GrowthWorkOverview

All use requireProjectContext and derive project/user authority from middleware. No user-supplied actor/content/target/version/creation key. Get validates source check membership; missing old suggestion returns null, invalid/foreign identifiers fail safely. Approve only terminal completed/completed_with_errors source checks and supported template suggestions. Changes after unknown success must never overwrite the action.

Generation policy and scope are in plan.md. Existing immutable creation includes actor and date; retain it. If another actor already saved the action, return the saved result explicitly or surface a safe conflict, never claim that the new actor performed the original approval. A stable key per recommendation, not a random nonce, is required. Handle the review-accepted/action-not-created intermediate state.

Keep new files under existing repository lint bounds. Add focused tests and a real SQLite integration test using existing test patterns. Do not run the full CI/build; Director owns those once the slice is assembled. Do not spawn agents or access real projects/providers.
