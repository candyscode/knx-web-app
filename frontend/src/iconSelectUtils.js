export function getSelectOption(options, value) {
  if (!Array.isArray(options) || options.length === 0) {
    return null;
  }

  return options.find((option) => option.value === value) || options[0];
}

export function getDropdownPosition(triggerRect, menuRect = {}, viewport = {}) {
  if (!triggerRect) {
    return null;
  }

  const gap = 4;
  const viewportPadding = 8;
  const width = Math.max(triggerRect.width || 0, 160);
  const menuHeight = menuRect.height || 0;
  const viewportWidth = viewport.innerWidth || 0;
  const viewportHeight = viewport.innerHeight || 0;
  const scrollX = viewport.scrollX || 0;
  const scrollY = viewport.scrollY || 0;

  const minLeft = scrollX + viewportPadding;
  const maxLeft = scrollX + Math.max(viewportPadding, viewportWidth - width - viewportPadding);
  const unclampedLeft = scrollX + triggerRect.left;
  const left = Math.min(Math.max(unclampedLeft, minLeft), maxLeft);

  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const shouldOpenAbove = menuHeight > 0
    && spaceBelow < menuHeight + viewportPadding
    && spaceAbove >= menuHeight + viewportPadding;

  const top = shouldOpenAbove
    ? scrollY + triggerRect.top - menuHeight - gap
    : scrollY + triggerRect.bottom + gap;

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(Math.max(scrollY + viewportPadding, top))}px`,
    width: `${Math.round(width)}px`,
  };
}
