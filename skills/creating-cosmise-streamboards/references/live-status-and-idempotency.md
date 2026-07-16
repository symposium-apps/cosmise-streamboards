# Live status and idempotency recipe

## Prevent false loading

Separate background reconciliation from user-visible agent work at the producer boundary:

- Scheduled report inventory and connection-health calls should use the wrapper's silent/no-record option.
- Explicit synchronization requested by a user or agent may record activity.
- The browser must not infer activity from connection state, selected reports, old events, or sidebar labels.
- Compute `isActive` from the current authoritative task only, using explicit nonterminal statuses.
- Link the task to the exact Streamboard resource immediately after creation.

When polling, keep the report iframe, overlay root, tabs, and sidebar DOM mounted. Update only existing overlay text and progress width. Never replay an entrance animation for a progress update.

## Status presentation

Build status is overlay-only. Do not render a global agent strip or floating agent-status toast. New unpublished reports use the overlay over a Streamboard skeleton; published reports use it over the still-mounted iframe. Remove it immediately when the linked task becomes terminal. Utility feedback such as “link copied” is separate from build status.

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
