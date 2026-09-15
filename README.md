# Tenderat AI Albania

Private Albanian tender-intelligence workspace for construction companies.

This separate app is intentionally focused on the discovery problem:

1. Drag one or more APP bulletin PDFs into the app.
2. The worker extracts contract notices and lots from the 1,000+ page bulletin.
3. Each notice is matched against the company capability profile.
4. The app ranks the best opportunities and explains the reasons with PDF-page evidence.

## Advanced company capabilities

`/capabilities` is now an 11-step qualification and operational-capacity workspace covering company identity, work and CPV coverage, geography, licences, key people, labour pools, multiple crew formations, equipment, financial capacity, reference projects, partners, active commitments, and bid rules.

- Profile edits are saved as drafts and do not change live tender rankings.
- Activation creates an immutable capability version and re-ranks active tenders.
- Readiness is calculated from real completeness, expiry, availability, and freshness checks.
- Tender matching uses nine weighted capability dimensions and distinguishes confirmed capabilities, gaps, blockers, stale data, and unverified requirements.
- Supporting PDF, image, and DOCX evidence can be attached to each capability section.
- This capability release intentionally excludes labour rates, material costs, and detailed cost estimating.

The app supports local mode for offline development and passwordless single-company Supabase mode for the production handoff. In local mode, uploaded bulletins, capability versions, evidence documents, and profile changes are persisted under the ignored `data/` directory. In Supabase mode, the server uses the existing project credentials and private storage; the engineer uses a preconfigured company link and never sees Supabase or OpenRouter setup.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3012.

The demo workspace contains examples from the structure of APP Bulletin No. 54 (24.08.2026). Uploaded PDFs are processed asynchronously by the local worker and stored locally so development can be restarted without losing its workspace.

## Production notes

- APP PDFs are manually downloaded and uploaded by the user; the app does not bypass APP's published automated-download restrictions.
- Keep `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `OPENROUTER_API_KEY` server-only. The ready-to-run company ZIP contains the existing values by explicit request; do not publish or forward it outside the company.
- Configure `PASSWORDLESS_MODE=1`, `DATA_BACKEND=supabase`, the existing Supabase project values, `COMPANY_WORKSPACE_ID`, the existing OpenRouter key, and `APP_LINK_TOKEN` for the company installation.
- The web app uses the private server client for the single company workspace. The browser never receives private credentials.
- AI insights are optional. Set `OPENROUTER_API_KEY` or `OPENAI_API_KEY` to add validated Albanian evidence summaries for the highest-ranked notices; deterministic extraction, CPV suggestions, and ranking remain available without an AI provider.
- `OPENAI_TENDER_MAX_NOTICES` can cap optional AI enrichment per bulletin (default: 12, maximum: 25).

## Move the local workspace to Supabase

The local workspace is preserved. First validate it, then run the dry run:

```powershell
npm run validate:local
npm run migrate:supabase:dry
```

For passwordless mode, run `npm run provision:workspace` once with the existing Supabase private key, set the returned UUID as `COMPANY_WORKSPACE_ID` and `SUPABASE_IMPORT_USER_ID`, then run `npm run migrate:supabase` and `npm run compare:supabase`. The migration is idempotent for the bulletin and tender records; keep the local `data/` directory as the rollback copy.

## Ready-to-run company package

Run `npm run package:handoff` only in a private working folder after the existing Supabase private key and existing OpenRouter key are present in `.env.local`. The command provisions the invisible technical workspace record and link token when needed, builds the standalone app, and creates `TenderatAI-Company-Ready.zip`. The package includes the existing credentials and must be transferred privately.

The package also includes simple backup, restore, update, and uninstall utilities. The first version uses a Cloudflare Quick Tunnel, so the outside-company link can change after a tunnel restart; a permanent custom URL requires a company-owned domain and Cloudflare tunnel credentials.
