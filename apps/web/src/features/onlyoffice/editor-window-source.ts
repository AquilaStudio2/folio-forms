/** A bridge may reconnect only from a live frame belonging to this editor. */
export const isEditorWindowSource = (
  source: MessageEventSource | null,
  surface: HTMLElement | null
): source is Window => {
  if (!source || !surface) {
    return false;
  }
  const roots = new Set(
    [...surface.querySelectorAll("iframe")]
      .map((frame) => frame.contentWindow)
      .filter((frame): frame is Window => frame !== null)
  );
  let current = source as Window;
  const visited = new Set<Window>();
  try {
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current.closed) {
        return false;
      }
      if (roots.has(current)) {
        return true;
      }
      // Window.parent, Window.length and indexed child access are available
      // across origins; do not read the office frame's document or location.
      const { parent } = current;
      if (!parent || parent === current) {
        return false;
      }
      let attached = false;
      // oxlint-disable-next-line typescript/prefer-for-of -- Cross-origin Window children are indexed, not iterable.
      for (let index = 0; index < parent.length; index += 1) {
        if (parent[index] === current) {
          attached = true;
          break;
        }
      }
      if (!attached) {
        return false;
      }
      current = parent;
    }
  } catch {
    return false;
  }
  return false;
};
