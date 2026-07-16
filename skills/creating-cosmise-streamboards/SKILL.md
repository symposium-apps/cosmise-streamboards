---
name: creating-cosmise-streamboards
description: Use when creating, updating, validating, publishing, repairing, or deleting Cosmise Streamboards through the cosmise-streamboards app and its wrapped production MCP.
version: 0.2.0
author: Cosmise Streamboards
license: MIT
metadata:
  hermes:
    tags: [cosmise, streamboards, analytics, reporting, mcp]
---

# Creating Cosmise Streamboards

## When to use

Use this skill for any Cosmise Streamboard task: discovery, creation, widget selection, formulas, layout, refresh, publication, repair, duplication, rollback, or deletion.

## Install this repository skill into the active profile

This repository copy is canonical. Before Streamboards work, the active Hermes profile must have this skill in its own skill set.

1. Read this file from `skills/creating-cosmise-streamboards/SKILL.md`.
2. Check whether `creating-cosmise-streamboards` is available with `skills_list` or `skill_view`.
3. If absent, install the exact repository copy into the **active** profile with `skill_manage(action="create", name="creating-cosmise-streamboards", category="cosmise", content=<this complete SKILL.md>)`.
4. If skill tools are unavailable, copy this directory to:
   `~/.hermes/profiles/<active-hermes-profile>/skills/cosmise/creating-cosmise-streamboards/`
5. Never infer the Hermes profile name from an organisation, workspace, customer, or `SYM_PROFILE_ID`. Inspect the active Hermes profile first.
6. When this repository skill changes, update the installed profile copy before the next Streamboards task.

Do not edit another Hermes profile. Installation always targets the profile running the current session.

## Non-negotiable boundaries

- Use this app's local `/mcp` wrapper for every production `streamboards_*` call. Do not connect around it.
- Read production credentials only through the app backend process. Never print, request, return, log, summarize, hash, or persist them.
- `GET /api/state` is the browser-facing authority for tasks, activity, selected/open reports, sidebar state, and runtime readiness.
- A production action receipt is not verification. Read the resulting board/layout/publication/cache state independently.
- Never claim cache completion while work is scheduled or running.
- Never claim email delivery; a send receipt proves only that the application completed the send call.
- Preview destructive operations. Require explicit confirmation for permanent deletion unless the user has already clearly authorized it.

## Required startup sequence

1. Call `cosmise_app_get_bootstrap`.
2. Call `cosmise_app_get_state`.
3. Inspect `runtime.backend_mcp_configured` and connection state.
4. If unavailable, call `cosmise_app_update_connection` with `state: "missing_key"`, tell the operator to open Connections and synchronize Cosmise, and stop production work.
5. Call `cosmise_app_sync_now`.
6. Call `streamboards_get_context`; verify the organisation resolved by the credential.
7. Call `streamboards_get_capabilities`, `streamboards_list_connections`, and `streamboards_list_query_catalog`.
8. Inspect relevant existing boards, branding, bundled layout examples, and live templates.
9. Start one visible task with `cosmise_app_start_task`. Attach `resource.type="streamboard"` and the board ID whenever known.
10. Use `cosmise_app_set_view` only for an intentional visible switch.

## Build native reporting, not decorative text

Metric content should normally use one of:

1. `master_custom_metric` widgets from the live metric catalog;
2. formula widgets built from catalogued metric tokens;
3. supported existing/fixed query widgets;
4. an existing widget or live template when it already expresses the requested business view.

Do **not** use Markdown, informational, or header widgets as substitutes for actual metrics. Static content is appropriate only when it has a real presentation role, such as a branded cover, a short methodology note, or an explicitly requested narrative.

Prefer fewer useful native widgets over a full canvas of weak, empty, duplicated, or misleading content.

## Connection and metric discovery quirks

- The connection summary can under-report usable platforms. Treat it as one signal, not the final proof.
- Cross-check the live query catalog, existing successful native datastream caches, and a new widget's terminal cache result.
- Never assume that a platform with one cached metric has enough depth for a useful section.
- Use only metrics returned by the live catalog for the platform and mode.
- A successful cache job proves execution, not usefulness. Inspect whether the result is populated and meaningful.
- Remove an empty or misleading widget unless the zero state is itself useful and clearly labelled.

## Consumer-facing language

Every visible title, subtitle, task, status, formula, and activity detail must make sense to a non-technical customer.

Good:

- `Website health`
- `Revenue per advertising dollar`
- `Pinterest performance over time`
- `Quality check`
- `Report ready`

Avoid exposing:

- raw tool names such as `streamboards_get_layout`;
- implementation statuses such as `verifying` or `task.completed`;
- platform API field names when a plain business label exists;
- IDs, query keys, internal connection details, or cache internals.

Formula labels must state their real business meaning. Do not call a directional blended ratio “attributed ROAS” unless the numerator is actually attributed revenue under the selected model.

## Formula rules

- Use catalogued metric tokens only.
- Verify all input platforms and metrics are available.
- Set clear units and symbol position.
- Mark `lower_is_better` correctly.
- Avoid division by zero or formulas whose denominator is commonly absent.
- Distinguish platform-reported outcomes, first-party attribution, and directional blended ratios.
- Do not create a formula only to make the layout look complete.

Common useful formula families, only when inputs exist:

- total paid-media spend;
- revenue per advertising dollar;
- cost per attributed order;
- conversion rate;
- new-customer share;
- returning-customer revenue share;
- channel contribution to site traffic.

## Layout rules

- Streamboards use a 48-column grid.
- Inspect two or three relevant examples before laying out a substantial board.
- Use a consistent vertical rhythm and align section edges.
- A useful default is full-width metric groups and trends, with three 16-column formula cards in one row.
- Use tile groups for executive snapshots and `table_with_graph` for daily movement.
- Keep the cover compact; the report should reach useful data quickly.
- Validate bounds, overlap, orphan references, hidden state, and widget/datastream agreement.
- Do not blindly clone a template. Map neutral slots to newly created widget IDs and adapt the composition to the brief.

## Anonymized patterns learned from premium Streamboards

These observations were derived from dozens of premium-only production Streamboards across two anonymized cohorts. They describe reusable structure only. Never copy or reveal source agency names, organisation names, report titles, IDs, URLs, prose, account details, or metric values.

### Two proven report archetypes

**Specialist performance deep dive**

- Usually 13–20 widgets.
- Starts with compact navigation or a cover, followed by three or four clear section dividers.
- Relies on supported fixed-query widgets for campaign, ad group, creative, keyword, device, publisher-platform, conversion-type, and geographic drilldowns.
- Uses full-width detail tables heavily, with occasional half-width comparisons.
- May use no formulas at all when the goal is diagnostic depth rather than an executive scorecard.
- Works well for channel operators who need to move from totals into the entity causing a change.

**Executive commerce and media command center**

- Usually 19–28 widgets.
- Commonly combines a cover, five to seven compact section dividers, six to eight native metric-tile groups, several formula cards, and campaign/creative detail tables.
- Often covers three or four connected platforms rather than forcing every available connection into the report.
- Uses a recurring three-card formula row around 15–17 columns per card, followed by full-width channel sections.
- Pairs media delivery metrics with commerce/customer metrics so spend can be interpreted against revenue and customer quality.
- Uses formulas primarily for cross-channel investment and customer-mix questions, not decorative arithmetic.

### Premium composition lessons

- Full-width sections dominate strong premium layouts. Half-width widgets are selective, and third-width cards are mainly used for formulas or concise executive outcomes.
- Compact headers around two rows high create useful pacing in long reports without becoming narrative filler.
- A cover is common, but useful metrics should follow quickly.
- Native tile groups often carry 6–9 related metrics for one platform, rather than scattering one metric across many cards.
- Strong channel sections pair an executive tile group with one or more deeper campaign, creative, keyword, or entity tables.
- Commerce sections commonly pair sales/order value with new-versus-returning customer composition.
- Spend-only helper widgets can legitimately feed formulas, but should not occupy prominent report space unless the spend value itself is part of the story.
- Daily charts are used selectively. A premium report does not need a trend chart for every platform; diagnostic tables can provide more decision value.
- The premium examples used little or no Markdown/informational narrative. Structure, labels, metric grouping, and formulas carried the explanation.
- Repeated formulas commonly answer total investment, channel share of investment, customer share, and customer revenue-mix questions.

### Recommended premium sequence

Adapt this sequence rather than copying it mechanically:

1. Compact branded cover.
2. Executive outcome tiles.
3. Cross-channel formulas in a three-card row.
4. Commerce and customer-quality section.
5. One section per important paid channel: summary tiles first, diagnostic detail second.
6. Selected trend views only where movement over time changes the decision.
7. Optional entity-level tables for campaign, creative, keyword, device, or geography.

Choose the archetype from the audience. Executives need outcome hierarchy and honest formulas; operators need campaign/entity depth. A report serving both should begin with the command center and progressively disclose diagnostic detail below it.

## Duplicate prevention

Before creating a board:

1. List current boards immediately before the write.
2. Check both intended title and slug.
3. Reuse or update the intended board when appropriate.
4. After creation, list again and confirm there is exactly one intended identity.
5. If concurrent work produced duplicates, compare layout depth, native widget count, cache health, publication state, and URLs before deleting anything.
6. Delete the weaker duplicate only with authorization, then synchronize local report state and restore the intended active view.

## Realtime UI behavior

- Start and update a visible task during genuine work.
- Background report inventory and connection reconciliation must use `record: false`; maintenance polling must not look like agent work.
- The persistent status toast should show loading only for a genuine `running`, `queued`, or `waiting` task.
- Do not repeatedly select an already active report.
- Preserve the report iframe when both report ID and verified public URL are unchanged.
- Inventory synchronization must not hijack the active report.
- Use `public_url` for embedding. Treat `edit_url` as external navigation only.

## End-to-end build loop

1. Discover the business goal and connected sources.
2. List current boards and rule out title/slug duplicates.
3. Start the app task and focus the target resource.
4. Choose a layout pattern.
5. Create or update the board and effective query configuration.
6. Apply organisation branding where useful.
7. Add native custom metrics, fixed queries, existing widgets, and honest formulas.
8. Update task progress with concise customer-facing milestones.
9. Validate the 48-column layout.
10. Refresh dynamic widgets.
11. Poll cache status until every widget is terminal.
12. Inspect each result for errors, emptiness, and usefulness.
13. Repair or remove weak widgets; validate again.
14. Publish only when requested.
15. Verify canonical public and edit URLs.
16. Synchronize the app report inventory.
17. Set the intended report active once.
18. Call `cosmise_app_show_verification`.
19. Call `cosmise_app_complete_task` with machine-readable verification.
20. Report native widget count, formula count, cache successes/errors, public URL, and any honest limitation.

## Verification matrix

| Change | Required verification |
|---|---|
| Create/update board | `streamboards_get` plus `streamboards_validate` |
| Add/update/remove widget | widget/layout read plus validation |
| Query configuration | effective query config plus validation |
| Cache refresh | poll until no running/scheduled work remains |
| Publish | publication state plus canonical URLs |
| Branding | effective branding read |
| Duplicate cleanup | authoritative board list shows one intended identity |
| Delete | preview, confirmed delete, then board absent from list |
| Completion | app state shows intended report open/selected and task terminal |

## Completion standard

A Streamboard is complete only when:

- it answers the requested business question;
- visible labels are consumer-friendly;
- metric content is native rather than decorative text;
- formulas are honest and unit-correct;
- the layout validates;
- all dynamic caches are terminal;
- no failed, empty, duplicated, or misleading widget remains without explanation;
- publication and URLs are verified when requested;
- the local app shows the intended report without duplicate tabs or false loading activity;
- the final summary distinguishes verified facts from limitations.
