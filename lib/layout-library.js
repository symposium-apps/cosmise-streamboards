'use strict';

const library = require('../data/layout-templates.json');

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function listLayoutTemplates(input = {}) {
  const widgetTypes = new Set((Array.isArray(input.widget_types) ? input.widget_types : String(input.widget_type || '').split(','))
    .map((item) => String(item).trim()).filter(Boolean));
  const minWidgets = integer(input.min_widgets, 0, 0, 500);
  const maxWidgets = integer(input.max_widgets, 500, 0, 500);
  const limit = integer(input.limit, 100, 1, 100);

  const templates = library.templates.filter((template) => {
    if (template.widget_count < minWidgets || template.widget_count > maxWidgets) return false;
    if (widgetTypes.size && ![...widgetTypes].every((type) => template.widgets.some((widget) => widget.widget_type === type))) return false;
    return true;
  }).slice(0, limit);

  return {
    schema_version: library.schema_version,
    kind: library.kind,
    source_policy: library.source_policy,
    catalog_summary: library.catalog_summary,
    grid: library.grid,
    agent_rules: library.agent_rules,
    filters: {
      widget_types: [...widgetTypes],
      min_widgets: minWidgets,
      max_widgets: maxWidgets,
      limit
    },
    count: templates.length,
    templates
  };
}

function getLayoutTemplate(id) {
  return library.templates.find((template) => template.id === String(id || '')) || null;
}

module.exports = { library, listLayoutTemplates, getLayoutTemplate };
