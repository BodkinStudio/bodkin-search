# Sources and Assumptions

This planning pack was updated on 29 August 2026 against the then-current public OpenSEO repository/documentation.

Codex should treat implementation facts as potentially stale and inspect current upstream before coding.

## OpenSEO

- Repository: https://github.com/every-app/open-seo
- Product: https://openseo.so/
- Features: https://openseo.so/features
- MCP docs: https://openseo.so/docs/mcp
- Codex plugin: https://openseo.so/docs/codex-plugin
- Agent skills: https://openseo.so/docs/skills

At review time the repository exposed organisation-scoped projects, rank-history tables, backlink-history tables, GSC/MCP tooling, Cloudflare workflows, D1 and Postgres paths, Better Auth and an MCP server.

## Relevant OpenSEO areas that were changing

Recent public issues/PRs included work or proposals around:

- GA4 in MCP;
- AI-search/AEO visibility via MCP;
- shareable client reports;
- additional search-engine data;
- rank scheduling.

Do not implement a fork-specific version without checking whether upstream has since shipped it.

## Semantic.io

Public Semantic.io material was used as strategic inspiration for:

- orchestration;
- recurring monitoring cadence;
- auditable automated SEO workflows;
- execution loops;
- governance.

This product must not attempt to clone Semantic.io feature-for-feature.

The useful principle to retain is the closed operating loop, not its exact product surface.
