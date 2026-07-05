"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EssentialCategory,
  EssentialItem,
  EssentialSecondhand,
  EssentialStatus,
  addEssentialItem,
  deleteEssentialItem,
  getEssentialItems,
  getEssentialPreferences,
  updateEssentialItem,
  upsertEssentialPreferences,
} from "../lib/api";

const CATEGORIES: readonly EssentialCategory[] = [
  "Sleep",
  "Feeding",
  "Clothing",
  "Bath",
  "Gear",
  "Health",
  "Travel",
  "Nursery",
] as const;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

interface Preferences {
  accept_secondhand: EssentialSecondhand;
  notes: string;
}

interface Suggestion {
  id: string;
  name: string;
  category: EssentialCategory | undefined;
  estimated_cost?: number | null;
  description?: string | null;
}

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const PREFS_NOTES_PLACEHOLDER =
  "e.g. Small flat (no big nursery furniture), happy with second-hand for clothes, allergic to wool…";

function formatGBP(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface EssentialsViewProps {
  userId?: string;
  onSuggestEssentials?: () => void;
  refreshKey?: number;
}

export default function EssentialsView({ userId = DEFAULT_USER_ID, onSuggestEssentials, refreshKey = 0 }: EssentialsViewProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    accept_secondhand: "no_preference",
    notes: "",
  });
  const [items, setItems] = useState<EssentialItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<EssentialCategory>("Sleep");
  const [newCost, setNewCost] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    category: EssentialCategory;
    cost: string;
    url: string;
    notes: string;
  }>({ name: "", category: "Sleep", cost: "", url: "", notes: "" });

  // ----- Hydration -----

  const refetch = useCallback(async () => {
    const fresh = await getEssentialItems(userId);
    setItems(fresh);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, fetched] = await Promise.all([
          getEssentialPreferences(userId),
          getEssentialItems(userId),
        ]);
        if (cancelled) return;
        setPreferences({
          accept_secondhand: prefs.accept_secondhand,
          notes: prefs.notes ?? "",
        });
        setItems(fetched);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load essentials data", err);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Refetch items when suggestions are made (refreshKey changes)
  useEffect(() => {
    if (refreshKey > 0) {
      void refetch();

      // Fetch latest suggestions from the backend
      (async () => {
        try {
          const response = await fetch(
            `http://localhost:8000/api/essentials/latest-suggestions/${userId}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.suggestions && data.suggestions.length > 0) {
              // Create temporary suggestion objects for UI display
              const tempSuggestions: Suggestion[] = data.suggestions.map(
                (item: any, i: number) => ({
                  id: `temp-${Date.now()}-${i}`,
                  name: item.name,
                  category: item.category,
                  estimated_cost: item.estimated_cost ?? null,
                  description: item.description ?? null,
                })
              );
              setSuggestions(tempSuggestions);
            }
          }
        } catch (err) {
          console.error("Failed to fetch suggestions", err);
        } finally {
          // Stop loading once we've tried to fetch suggestions
          setSuggestionsLoading(false);
        }
      })();
    }
  }, [refreshKey, refetch, userId]);

  // Debounced preferences save with status indicator.
  // The skipNextPrefsSave ref suppresses the next save when state is
  // hydrated from the server (initial mount).
  const skipNextPrefsSave = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (skipNextPrefsSave.current) {
      skipNextPrefsSave.current = false;
      return;
    }
    setSaveStatus("dirty");
    const handle = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await upsertEssentialPreferences(userId, {
          accept_secondhand: preferences.accept_secondhand,
          notes: preferences.notes.trim() ? preferences.notes : null,
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to save preferences", err);
        setSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [preferences, loaded, userId]);

  // ----- Derived data -----

  const skippedCount = items.filter((i) => i.status === "skipped").length;

  const mainListItems = useMemo(() => {
    const visible = items.filter(
      (i) =>
        (i.is_must_have && i.status !== "skipped") ||
        (i.status === "skipped" && showSkipped),
    );
    const statusOrder: Record<EssentialStatus, number> = {
      needed: 0, bought: 1, skipped: 2,
    };
    return [...visible].sort((a, b) => {
      if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
      if (a.category !== b.category) {
        return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
      }
      return a.name.localeCompare(b.name);
    });
  }, [items, showSkipped]);

  const shortlistItems = useMemo(() => {
    return items
      .filter((i) => !i.is_must_have && i.status !== "skipped")
      .sort((a, b) => {
        if (a.category !== b.category) {
          return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
        }
        return a.name.localeCompare(b.name);
      });
  }, [items]);

  const totals = useMemo(() => {
    const needed = items.filter(
      (i) => i.is_must_have && i.status === "needed",
    );
    return {
      neededCount: needed.length,
      neededCost: needed.reduce((acc, i) => acc + (i.estimated_cost ?? 0), 0),
    };
  }, [items]);

  // ----- Helpers -----

  const upsertItemInState = (item: EssentialItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };

  // ----- Item actions -----

  const setStatus = async (id: string, status: EssentialStatus) => {
    try {
      const updated = await updateEssentialItem(userId, id, { status });
      upsertItemInState(updated);
    } catch (err) {
      console.error("Failed to change status", err);
      await refetch();
    }
  };

  const promoteToMustHave = async (id: string) => {
    try {
      const updated = await updateEssentialItem(userId, id, {
        is_must_have: true,
      });
      upsertItemInState(updated);
    } catch (err) {
      console.error("Failed to promote", err);
      await refetch();
    }
  };

  const demoteToShortlist = async (id: string) => {
    try {
      const updated = await updateEssentialItem(userId, id, {
        is_must_have: false,
      });
      upsertItemInState(updated);
    } catch (err) {
      console.error("Failed to demote", err);
      await refetch();
    }
  };

  const removeItem = async (id: string) => {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await deleteEssentialItem(userId, id);
    } catch (err) {
      console.error("Failed to delete", err);
      setItems(previous);
    }
  };

  // ----- Inline edit -----

  const startEdit = (item: EssentialItem) => {
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      category: item.category,
      cost: item.estimated_cost !== null ? String(item.estimated_cost) : "",
      url: item.purchase_url ?? "",
      notes: item.notes ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  const saveEdit = async () => {
    if (!editingItemId) return;
    const trimmedName = editForm.name.trim();
    if (!trimmedName) return;
    const costNum = editForm.cost.trim() ? parseFloat(editForm.cost) : NaN;
    const trimmedUrl = editForm.url.trim();
    const trimmedNotes = editForm.notes.trim();

    const update: Parameters<typeof updateEssentialItem>[2] = {
      name: trimmedName,
      category: editForm.category,
    };
    if (Number.isFinite(costNum)) update.estimated_cost = costNum;
    else update.clear_estimated_cost = true;
    if (trimmedUrl) update.purchase_url = trimmedUrl;
    else update.clear_purchase_url = true;
    if (trimmedNotes) update.notes = trimmedNotes;
    else update.clear_notes = true;

    try {
      const updated = await updateEssentialItem(
        userId,
        editingItemId,
        update,
      );
      upsertItemInState(updated);
      setEditingItemId(null);
    } catch (err) {
      console.error("Failed to save edit", err);
      await refetch();
      setEditingItemId(null);
    }
  };

  const handleEditKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && editForm.name.trim()) {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  // ----- Add new item -----

  const addItem = async () => {
    const name = newName.trim();
    if (!name) return;
    const costNum = newCost.trim() ? parseFloat(newCost) : NaN;
    setNewName("");
    setNewCost("");
    setNewUrl("");
    try {
      const created = await addEssentialItem(userId, {
        name,
        category: newCategory,
        status: "needed",
        // Items the parents type in default to must-have (committed).
        // AI suggestions land in the shortlist for consideration.
        is_must_have: true,
        estimated_cost: Number.isFinite(costNum) ? costNum : null,
        purchase_url: newUrl.trim() || null,
        source: "parent",
      });
      upsertItemInState(created);
    } catch (err) {
      console.error("Failed to add item", err);
      await refetch();
    }
  };

  // ----- AI suggestions -----

  const generateSuggestions = async () => {
    if (suggestionsLoading) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions([]);

    // Trigger chat message so agent can respond with suggestions in context
    onSuggestEssentials?.();

    // Keep loading until suggestions are actually fetched
    // (they'll be fetched separately via refreshKey)
  };

  const upvoteSuggestion = async (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
    try {
      const created = await addEssentialItem(userId, {
        name: s.name,
        category: s.category ?? "Sleep",
        status: "needed",
        // AI suggestions land on the shortlist (nice-to-have); parents
        // promote with ☆ once decided.
        is_must_have: false,
        estimated_cost: s.estimated_cost ?? null,
        notes: s.description ?? null,
        source: "ai",
      });
      upsertItemInState(created);
    } catch (err) {
      console.error("Failed to upvote suggestion", err);
      await refetch();
    }
  };

  const downvoteSuggestion = async (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
    try {
      const created = await addEssentialItem(userId, {
        name: s.name,
        category: s.category ?? "Sleep",
        status: "skipped",
        is_must_have: false,
        estimated_cost: s.estimated_cost ?? null,
        notes: s.description ?? null,
        source: "ai",
      });
      upsertItemInState(created);
    } catch (err) {
      console.error("Failed to downvote suggestion", err);
      await refetch();
    }
  };

  // ----- Render helpers -----

  const renderShortlistChip = (item: EssentialItem) => (
    <div key={item.id} className="shortlist-chip essentials-shortlist-chip">
      <span className="shortlist-chip-name">{item.name}</span>
      <span className="essential-item-category">{item.category}</span>
      <div className="shortlist-chip-actions">
        <button
          type="button"
          className="star-btn"
          onClick={() => void promoteToMustHave(item.id)}
          title="Move to must-haves"
        >
          ☆
        </button>
        <button
          type="button"
          className="chip-x"
          onClick={() => void setStatus(item.id, "skipped")}
          title="Skip"
        >
          ×
        </button>
      </div>
    </div>
  );

  const renderItemCard = (item: EssentialItem) => {
    if (editingItemId === item.id) {
      return (
        <div
          key={item.id}
          className={`essential-item essential-item-editing essential-item-${item.status}`}
        >
          <div className="essential-item-edit-form">
            <div className="essential-item-edit-row">
              <input
                type="text"
                className="names-input essential-item-edit-name"
                placeholder="Name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                onKeyDown={handleEditKey}
                autoFocus
              />
              <select
                className="essentials-add-category"
                value={editForm.category}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    category: e.target.value as EssentialCategory,
                  }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="essential-item-edit-row">
              <div className="essentials-add-cost-wrap">
                <span className="essentials-add-cost-prefix">£</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="names-input essentials-add-cost"
                  placeholder="Cost"
                  value={editForm.cost}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, cost: e.target.value }))
                  }
                  onKeyDown={handleEditKey}
                />
              </div>
              <input
                type="url"
                className="names-input essential-item-edit-url"
                placeholder="Link (optional)"
                value={editForm.url}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, url: e.target.value }))
                }
                onKeyDown={handleEditKey}
              />
            </div>
            <input
              type="text"
              className="names-input"
              placeholder="Notes (optional)"
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
              onKeyDown={handleEditKey}
            />
            <div className="essential-item-edit-actions">
              <button
                type="button"
                className="essential-item-edit-cancel"
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="essential-item-edit-save"
                onClick={() => void saveEdit()}
                disabled={!editForm.name.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    const hasMeta = item.estimated_cost !== null || item.purchase_url || item.notes;
    const toggleBought = () => {
      if (item.status === "needed") void setStatus(item.id, "bought");
      else if (item.status === "bought") void setStatus(item.id, "needed");
    };
    return (
      <div
        key={item.id}
        className={`essential-item essential-item-${item.status}`}
      >
        <button
          type="button"
          className={`item-status-check item-status-check-${item.status}`}
          onClick={toggleBought}
          disabled={item.status === "skipped"}
          aria-pressed={item.status === "bought"}
          title={
            item.status === "bought"
              ? "Mark as not bought"
              : item.status === "needed"
              ? "Mark as bought"
              : "Skipped"
          }
        >
          {item.status === "bought" ? "✓" : item.status === "skipped" ? "⊘" : ""}
        </button>

        <div className="essential-item-content">
          <div className="essential-item-name-row">
            <span className="essential-item-name">{item.name}</span>
            <span className="essential-item-category">{item.category}</span>
          </div>
          {hasMeta && (
            <div className="essential-item-meta">
              {item.estimated_cost !== null && (
                <span className="essential-item-cost">{formatGBP(item.estimated_cost)}</span>
              )}
              {item.purchase_url && (
                <a
                  href={item.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="essential-item-link"
                >
                  Buy ↗
                </a>
              )}
              {item.notes && <span className="essential-item-notes">{item.notes}</span>}
            </div>
          )}
        </div>

        <div className="essential-item-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => startEdit(item)}
            title="Edit"
          >
            ✎
          </button>
          {item.status !== "skipped" && item.is_must_have && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => void demoteToShortlist(item.id)}
              title="Move to shortlist (nice-to-have)"
            >
              ↓
            </button>
          )}
          {(item.status === "needed" || item.status === "bought") && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => void setStatus(item.id, "skipped")}
              title="Skip"
            >
              ⊘
            </button>
          )}
          {item.status === "skipped" && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => void setStatus(item.id, "needed")}
              title="Add back to list"
            >
              ↺
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => void removeItem(item.id)}
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="essentials-layout">
      <section className="names-card essentials-items-section">
        <div className="names-card-header">
          <div className="essentials-header-text">
            <h2 className="names-section-title">Your essentials list</h2>
            <p className="names-section-hint">
              Track what you need, what you&apos;ve bought, and what you&apos;ve decided
              to skip. Estimated costs are in £ — rough numbers help you triage.
            </p>
          </div>
          <div className="essentials-summary">
            <div className="summary-stat">
              <span className="summary-label">To buy</span>
              <span className="summary-value">
                {formatGBP(totals.neededCost)}
                <small>
                  {" · "}
                  {totals.neededCount} {totals.neededCount === 1 ? "item" : "items"}
                </small>
              </span>
            </div>
          </div>
        </div>

        {!loaded ? (
          <div className="names-empty">Loading your list…</div>
        ) : mainListItems.length === 0 && shortlistItems.length === 0 ? (
          <div className="names-empty">
            No items yet. Add one below or get AI suggestions.
          </div>
        ) : (
          <>
            {mainListItems.length === 0 ? (
              <div className="names-empty">
                Nothing on your must-have list yet. Add one below or promote
                a shortlist item.
              </div>
            ) : (
              <div className="essentials-list">
                {mainListItems.map(renderItemCard)}
              </div>
            )}

            <div className="shortlist-divider essentials-shortlist-divider">
              <span>
                Shortlist
                {shortlistItems.length > 0 && <> · {shortlistItems.length}</>}
              </span>
            </div>
            {shortlistItems.length === 0 ? (
              <div className="names-empty">
                No nice-to-haves yet. Try the AI suggestions or add an item
                below and click ↓ to send it here.
              </div>
            ) : (
              <div className="shortlist-row">
                {shortlistItems.map(renderShortlistChip)}
              </div>
            )}
          </>
        )}

        {skippedCount > 0 && (
          <button
            type="button"
            className="essentials-skipped-toggle"
            onClick={() => setShowSkipped((v) => !v)}
          >
            {showSkipped
              ? `Hide skipped (${skippedCount})`
              : `Show ${skippedCount} skipped`}
          </button>
        )}

        <div className="essentials-add-row">
          <input
            type="text"
            className="names-input essentials-add-name"
            placeholder="Add an essential…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem();
            }}
            disabled={!loaded}
          />
          <select
            className="essentials-add-category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as EssentialCategory)}
            disabled={!loaded}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="essentials-add-cost-wrap">
            <span className="essentials-add-cost-prefix">£</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="names-input essentials-add-cost"
              placeholder="Cost"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addItem();
              }}
              disabled={!loaded}
            />
          </div>
          <input
            type="url"
            className="names-input essentials-add-url"
            placeholder="Link (optional)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem();
            }}
            disabled={!loaded}
          />
          <button
            type="button"
            className="names-btn-primary"
            onClick={() => void addItem()}
            disabled={!loaded || !newName.trim()}
          >
            Add
          </button>
        </div>
      </section>

      <div className="essentials-right-column">
        <section className="names-card">
          <div className="names-card-header">
            <div>
              <h2 className="names-section-title">What you have in mind</h2>
              <p className="names-section-hint">
                The AI uses these preferences to draft suggestions.
              </p>
            </div>
            {saveStatus !== "idle" && (
              <span
                className={`save-status save-status-${saveStatus}`}
                role="status"
                aria-live="polite"
              >
                {SAVE_STATUS_LABELS[saveStatus]}
              </span>
            )}
          </div>

          <div className="names-field">
            <label className="names-field-label">Accept second-hand?</label>
            <div className="chip-row">
              {(
                [
                  ["yes", "Yes"],
                  ["no", "No"],
                  ["no_preference", "No preference"],
                ] as [EssentialSecondhand, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${
                    preferences.accept_secondhand === value ? "chip-active" : ""
                  }`}
                  onClick={() =>
                    setPreferences((p) => ({ ...p, accept_secondhand: value }))
                  }
                  disabled={!loaded}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="names-field">
            <label className="names-field-label" htmlFor="essentials-notes">
              Notes for the AI
            </label>
            <textarea
              id="essentials-notes"
              className="names-textarea"
              placeholder={PREFS_NOTES_PLACEHOLDER}
              value={preferences.notes}
              onChange={(e) =>
                setPreferences((p) => ({ ...p, notes: e.target.value }))
              }
              rows={4}
              disabled={!loaded}
            />
          </div>
        </section>

        <section className="names-card">
          <div className="suggestions-header">
            <div>
              <h2 className="names-section-title">AI suggestions</h2>
              <p className="names-section-hint">
                Vote up to add to your list · Vote down to skip and never see again
              </p>
            </div>
            <button
              type="button"
              className="names-btn-primary"
              onClick={() => void generateSuggestions()}
              disabled={!loaded || suggestionsLoading}
            >
              {suggestionsLoading ? "Generating…" : "Suggest essentials"}
            </button>
          </div>

          {suggestionsLoading ? (
            <div className="suggestion-grid">
              {[0, 1, 2].map((i) => (
                <div
                  key={`skeleton-${i}`}
                  className="suggestion-card suggestion-card-skeleton"
                >
                  <div className="skeleton-line skeleton-line-name" />
                  <div className="skeleton-line skeleton-line-origin" />
                  <div className="skeleton-line skeleton-line-meaning" />
                  <div className="skeleton-line skeleton-line-meaning skeleton-line-short" />
                </div>
              ))}
            </div>
          ) : suggestionsError ? (
            <div className="names-empty names-empty-error">{suggestionsError}</div>
          ) : suggestions.length === 0 ? (
            <div className="names-empty">
              Click <strong>Suggest essentials</strong> and the AI will draft
              ideas based on your preferences and pregnancy week.
            </div>
          ) : (
            <div className="suggestion-grid">
              {suggestions.map((s) => (
                <div key={s.id} className="suggestion-card">
                  <div className="suggestion-name">{s.name}</div>
                  {s.category && (
                    <div className="suggestion-origin">{s.category}</div>
                  )}
                  <div className="suggestion-actions">
                    <button
                      type="button"
                      className="vote-btn vote-up"
                      onClick={() => void upvoteSuggestion(s.id)}
                      title="Add to list"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="vote-btn vote-down"
                      onClick={() => void downvoteSuggestion(s.id)}
                      title="Skip — don't show again"
                    >
                      ⊘
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
