# Anonymized premium Streamboard patterns

## Provenance and privacy boundary

These patterns come from a bounded, read-only structural review of 36 production Streamboards belonging only to organisations with all premium reporting flags enabled. The sample covered two independent report-building practices. Agency names, organisation names, report names, IDs, slugs, prose, values, account selections, and connection details were neither retained nor copied here.

Treat these as design evidence, not templates to clone blindly. The live brief, connected data, query catalog, and rendered usefulness remain authoritative.

## Two strong premium report shapes

### Channel-deep narrative report

Observed characteristics:

- Roughly 8–20 widgets.
- One cover, one navigation header, and three or four section headers.
- Mostly full-width fixed-query widgets for campaign, keyword, creative, geography, device, or conversion detail.
- Selective two-column rows when two views are directly comparable.
- A fixed reporting period such as last month or a deliberate premium custom range.
- A single attribution model and currency held consistently across the board.

Use this shape when the reader needs channel diagnosis more than an executive cross-channel scorecard. Full width is appropriate for dense tables and charts; do not compress complex campaign detail into KPI-card widths.

### Executive acquisition and commerce report

Observed characteristics:

- Roughly 19–28 widgets for the complete multi-platform form; smaller connected-source variants can be 8–18.
- Cover first, then five to seven short section headers.
- Native metric groups for paid channels and commerce outcomes.
- A compact formula band connecting acquisition spend to customer and revenue outcomes.
- Full-width campaign, creative, and trend detail beneath each summary section.
- Period comparison enabled in most reports.
- All-campaign scope by default; selected-campaign scope used only for an intentional brief.

Use this shape when the report must explain both marketing delivery and commercial efficiency.

## Reusable 48-column composition

A commonly successful visual rhythm is:

```text
48x9  cover
48x2  executive-summary header
48x4–6 native summary metric group
17x3 + 16x3 + 15x3 formula band
48x2  channel or commerce section header
48x4–7 native metric group
48x5–10 full-width campaign/trend/detail query
repeat section header → metric group → detail query as needed
```

Additional observed patterns:

- Covers were consistently full width and about nine grid rows high.
- Section headers were overwhelmingly `48x2`.
- Native metric groups were usually full width; compact groups sometimes shared a row with a formula or another metric group.
- Formula rows strongly favored three balanced cards at widths `17/16/15`, usually three grid rows high.
- Detailed query widgets were overwhelmingly full width and five to ten grid rows high.
- Daily native metrics were used sparingly. Most native metric groups were summary tiles, while fixed queries carried campaign and creative depth.

Do not cargo-cult the widget count. Preserve the rhythm while deleting sections unsupported by the active organisation's connections.

## Formula band with business meaning

In premium commerce-oriented reports, formulas were not decorative. They repeatedly answered a small set of business questions:

- total paid acquisition spend across the connected channels;
- cost per total customer;
- cost per new customer;
- cost per returning customer;
- net-sales efficiency against paid spend;
- new-customer revenue efficiency;
- returning-customer revenue efficiency.

Apply these only when the required paid-media and commerce metrics are populated. Use:

- currency symbols at the start for spend and acquisition-cost values;
- `x` at the end for efficiency ratios;
- `lower_is_better: true` for acquisition-cost formulas;
- `lower_is_better: false` for revenue-efficiency formulas.

A useful arrangement is two consecutive three-card formula rows: acquisition cost in the first row, revenue efficiency in the second. A standalone blended-spend card may sit beside channel summary metrics when that improves the visual hierarchy.

Never call a blended commerce-efficiency formula attributed ROAS. Attribution language requires an attribution-specific revenue source.

## Section sequencing

The most repeatable premium sequence was:

1. Cover.
2. Executive summary or efficiency formulas.
3. Section header.
4. Native metric summary.
5. Full-width campaign or trend detail.
6. Next section header.
7. Repeat summary → detail.

The strongest transitions were `header → native metric group → full-width query`, followed by another section header. Formula rows work best as a deliberate band between the cover/summary and channel detail, not scattered randomly through the report.

## Query and comparison choices

- Last month was the most common stable reporting preset.
- This month and last seven days appeared for active operational views.
- Premium custom date ranges were used for deliberate quarterly or campaign reporting.
- Comparison was common in executive multi-platform reports but not universal in channel-deep narratives.
- Use comparison only when the previous period is comparable and the UI communicates it clearly.
- Keep currency and attribution model consistent across the entire board.

## What not to copy

The review also found a few orphaned layout entries. Production examples can contain mistakes, even on premium instances. Therefore:

- never copy raw layout arrays;
- map only the structural rhythm to newly created widget IDs;
- validate after composition;
- verify no orphaned or overlapping entries;
- inspect caches and rendered output;
- remove unsupported filler.

A premium report is good because it creates a clear narrative from native data, formulas, and detail—not because it has many widgets.
