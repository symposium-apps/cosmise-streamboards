# Live status and idempotency recipe

## Prevent false loading

Separate background reconciliation from user-visible agent work at the producer boundary:

- Scheduled report inventory and connection-health calls should use the wrapper's silent/no-record option.
- Explicit synchronization requested by a user or agent may record activity.
- The browser must not infer activity from connection state, selected reports, old events, or sidebar labels.
- Compute `isActive` from the current authoritative task only, using explicit nonterminal statuses.
- Compute idle copy from the newest meaningful terminal event.

When polling, build a signature from stable identity, semantic status, message, and event timestamp. If unchanged, update only relative time; do not replace the toast, tabs, or sidebar DOM.

## Status presentation

Use semantic, visually distinct icon families:

- running: rotating refresh/progress glyph;
- queued or waiting: clock;
- success: check;
- failed: warning;
- informational: activity pulse.

Do not use decorative stars. During active work, an animated two-pixel bottom border is the preferred loading affordance. Terminal states must have no loading animation.

## Prevent duplicate reports

Before creating:

1. Synchronize the report inventory.
2. Check the intended slug.
3. If unavailable, list and inspect the board owning that slug.
4. Reuse or update the existing board unless the user explicitly requested a separate report.
5. Never work around a collision with `-live`, `-new`, or a timestamp merely because local state appears stale.

After creating:

1. List reports by immutable ID and slug, not title alone.
2. If titles repeat in the sidebar, inspect production inventory; two rows with different IDs are usually two real boards, not a rendering bug.
3. Compare widget count, cache health, publication state, and creation time before selecting the canonical board.
4. Preview/confirm deletion of the inferior duplicate.
5. Synchronize again and verify exactly one intended ID remains.

## Consumer-facing copy

Translate operation names before display. Avoid snake case, internal tool names, source IDs, and generic labels. Task details should describe the customer-visible action or result, such as “Refreshing website results” or “Report ready.”
