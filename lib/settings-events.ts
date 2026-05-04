// Same-tab propagation for settings changes.
//
// localStorage writes only fire 'storage' events in OTHER tabs, not the same
// tab that wrote them. When the settings modal toggles bilingual mode (or any
// other setting), pages reading those settings into local state need a signal
// to refresh in the SAME tab. This module dispatches a custom DOM event that
// any page can subscribe to.
//
// Pages that read settings-derived state (e.g. getBilingual()) should call
// onSettingsChanged() in a useEffect alongside their existing focus listener
// — focus covers cross-tab updates, this event covers same-tab updates.

const SETTINGS_CHANGED_EVENT = "beacon:settings-changed";

export function emitSettingsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
}

export function onSettingsChanged(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SETTINGS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, callback);
}
