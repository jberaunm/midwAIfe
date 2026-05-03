"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  NameCandidate,
  NameGender,
  addNameCandidate,
  deleteNameCandidate,
  getNameCandidates,
  getNamePreferences,
  reorderNameCandidates,
  suggestNames,
  updateNameStatus,
  upsertNamePreferences,
} from "../lib/api";

type PodiumRank = 1 | 2 | 3;
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

interface Preferences {
  gender: NameGender;
  notes: string;
}

// Local-only shape — suggestions only become NameCandidates once a parent votes.
interface Suggestion {
  id: string;
  name: string;
  origin?: string;
  meaning?: string;
}

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

interface NamesViewProps {
  userId?: string;
  onSuggestionMade?: () => void;
  refreshKey?: number;
}

export default function NamesView({
  userId = DEFAULT_USER_ID,
  onSuggestionMade,
  refreshKey = 0,
}: NamesViewProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    gender: "either",
    notes: "",
  });

  const [top, setTop] = useState<NameCandidate[]>([]);
  const [shortlist, setShortlist] = useState<NameCandidate[]>([]);
  const [rejectedNames, setRejectedNames] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [newName, setNewName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const sortByRank = (a: NameCandidate, b: NameCandidate) =>
    (a.rank ?? 0) - (b.rank ?? 0);

  const refetch = useCallback(async () => {
    const candidates = await getNameCandidates(userId);
    setTop(candidates.filter((c) => c.status === "top").sort(sortByRank));
    setShortlist(
      candidates.filter((c) => c.status === "shortlisted").sort(sortByRank),
    );
    setRejectedNames(
      new Set(
        candidates
          .filter((c) => c.status === "rejected")
          .map((c) => c.name.toLowerCase()),
      ),
    );
  }, [userId]);

  // Remote-driven refresh: agent may have changed the list or preferences
  // via tool calls. Refetch candidates always; refetch preferences only
  // when the user isn't mid-edit, so we don't clobber unsaved notes.
  useEffect(() => {
    if (!loaded || !refreshKey) return;
    let cancelled = false;
    (async () => {
      try {
        await refetch();
        if (cancelled) return;
        if (saveStatus === "dirty" || saveStatus === "saving") return;
        const prefs = await getNamePreferences(userId);
        if (cancelled) return;
        skipNextPrefsSave.current = true;
        setPreferences({
          gender: prefs.gender,
          notes: prefs.notes ?? "",
        });
      } catch (err) {
        console.error("Failed to refresh names data", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // saveStatus intentionally omitted — we only want this to run on
    // refreshKey changes, not whenever the save status flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, loaded, userId, refetch]);

  // Initial hydration
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, candidates] = await Promise.all([
          getNamePreferences(userId),
          getNameCandidates(userId),
        ]);
        if (cancelled) return;
        setPreferences({ gender: prefs.gender, notes: prefs.notes ?? "" });
        setTop(candidates.filter((c) => c.status === "top").sort(sortByRank));
        setShortlist(
          candidates.filter((c) => c.status === "shortlisted").sort(sortByRank),
        );
        setRejectedNames(
          new Set(
            candidates
              .filter((c) => c.status === "rejected")
              .map((c) => c.name.toLowerCase()),
          ),
        );
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load names data", err);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Debounced preferences save with status indicator. The skipNextPrefsSave
  // ref suppresses the next save when we hydrate state from the server
  // (initial mount and remote-triggered refresh).
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
        await upsertNamePreferences(userId, {
          gender: preferences.gender,
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

  // ----- Helpers -----

  const removeCandidateFromLists = (id: string) => {
    setTop((prev) => prev.filter((c) => c.id !== id));
    setShortlist((prev) => prev.filter((c) => c.id !== id));
  };

  const upsertCandidateInState = (candidate: NameCandidate) => {
    removeCandidateFromLists(candidate.id);
    if (candidate.status === "top") {
      setTop((prev) => [...prev, candidate].sort(sortByRank));
    } else if (candidate.status === "shortlisted") {
      setShortlist((prev) => [...prev, candidate].sort(sortByRank));
    } else {
      setRejectedNames((prev) => {
        const next = new Set(prev);
        next.add(candidate.name.toLowerCase());
        return next;
      });
    }
  };

  // ----- Preferences -----

  const setGender = (gender: NameGender) => {
    setPreferences((p) => ({ ...p, gender }));
  };

  // ----- Candidate actions -----

  const addManualName = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setNewName("");
    try {
      const created = await addNameCandidate(userId, {
        name: trimmed,
        status: "shortlisted",
        source: "parent",
      });
      upsertCandidateInState(created);
    } catch (err) {
      console.error("Failed to add name", err);
      await refetch();
    }
  };

  const promoteToTop = async (id: string) => {
    try {
      const updated = await updateNameStatus(userId, id, "top");
      upsertCandidateInState(updated);
    } catch (err) {
      console.error("Failed to promote", err);
      await refetch();
    }
  };

  const demoteFromTop = async (id: string) => {
    try {
      const updated = await updateNameStatus(userId, id, "shortlisted");
      upsertCandidateInState(updated);
    } catch (err) {
      console.error("Failed to demote", err);
      await refetch();
    }
  };

  const removeFromShortlist = async (id: string) => {
    const previous = shortlist;
    setShortlist((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteNameCandidate(userId, id);
    } catch (err) {
      console.error("Failed to delete", err);
      setShortlist(previous);
    }
  };

  const reorderTop = async (newOrder: NameCandidate[]) => {
    const previous = top;
    setTop(newOrder); // optimistic
    try {
      const updated = await reorderNameCandidates(
        userId,
        "top",
        newOrder.map((c) => c.id),
      );
      setTop(updated.sort(sortByRank));
    } catch (err) {
      console.error("Failed to reorder", err);
      setTop(previous);
    }
  };

  const moveTopUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...top];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    void reorderTop(next);
  };

  const moveTopDown = (idx: number) => {
    if (idx >= top.length - 1) return;
    const next = [...top];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    void reorderTop(next);
  };

  // ----- Suggestions -----

  const generateSuggestions = async () => {
    if (suggestionsLoading) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions([]);
    try {
      const response = await suggestNames(userId);
      const fresh: Suggestion[] = response.suggestions.map((s, i) => ({
        id: `ai-${response.message_id}-${i}`,
        name: s.name,
        origin: s.origin ?? undefined,
        meaning: s.meaning ?? undefined,
      }));
      setSuggestions(fresh);
      onSuggestionMade?.();
    } catch (err) {
      console.error("Failed to generate suggestions", err);
      setSuggestionsError("Couldn't generate suggestions. Try again in a moment.");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const upvoteSuggestion = async (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion) return;
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      const created = await addNameCandidate(userId, {
        name: suggestion.name,
        origin: suggestion.origin ?? null,
        meaning: suggestion.meaning ?? null,
        status: "shortlisted",
        source: "ai",
      });
      upsertCandidateInState(created);
    } catch (err) {
      console.error("Failed to upvote suggestion", err);
      await refetch();
    }
  };

  const downvoteSuggestion = async (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion) return;
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      const created = await addNameCandidate(userId, {
        name: suggestion.name,
        origin: suggestion.origin ?? null,
        meaning: suggestion.meaning ?? null,
        status: "rejected",
        source: "ai",
      });
      upsertCandidateInState(created);
    } catch (err) {
      console.error("Failed to downvote suggestion", err);
      await refetch();
    }
  };

  // ----- Render -----

  const renderPodiumSlot = (rank: PodiumRank) => {
    const idx = rank - 1;
    const candidate = top[idx];

    if (!candidate) {
      return (
        <div
          className={`podium-slot podium-${rank} podium-slot-empty`}
          key={`empty-${rank}`}
        >
          <div className="podium-rank">{rank}</div>
          <div className="podium-empty-text">Tap a star to fill this spot</div>
        </div>
      );
    }

    return (
      <div className={`podium-slot podium-${rank}`} key={candidate.id}>
        <div className="podium-rank">{rank}</div>
        <div className="podium-name">{candidate.name}</div>
        {(candidate.origin || candidate.meaning) && (
          <div className="podium-meta">
            {candidate.origin && <span>{candidate.origin}</span>}
            {candidate.origin && candidate.meaning && <span> · </span>}
            {candidate.meaning && <em>{candidate.meaning}</em>}
          </div>
        )}
        <div className="podium-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => moveTopUp(idx)}
            disabled={idx === 0}
            title="Move up in ranking"
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => moveTopDown(idx)}
            disabled={idx === top.length - 1}
            title="Move down in ranking"
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => demoteFromTop(candidate.id)}
            title="Move back to shortlist"
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  const extraTop = top.slice(3);

  return (
    <div className="names-layout">
      <section className="names-card names-card-full">
        <h2 className="names-section-title">Your shortlist</h2>
        <p className="names-section-hint">
          Star a name on your shortlist to lift it into your top three.
        </p>

        {!loaded ? (
          <div className="names-empty">Loading your names…</div>
        ) : (
          <>
            <div className="podium-label">Top three</div>
            <div className="podium">
              {/* Visual order: 2 — 1 — 3 */}
              {renderPodiumSlot(2)}
              {renderPodiumSlot(1)}
              {renderPodiumSlot(3)}
            </div>

            {extraTop.length > 0 && (
              <div className="podium-extras">
                <div className="podium-extras-label">Also on your top tier</div>
                <div className="shortlist-row">
                  {extraTop.map((n, i) => {
                    const idx = i + 3;
                    return (
                      <div key={n.id} className="shortlist-chip shortlist-chip-top">
                        <span className="shortlist-chip-rank">#{idx + 1}</span>
                        <span className="shortlist-chip-name">{n.name}</span>
                        <div className="shortlist-chip-actions">
                          <button
                            type="button"
                            className="star-btn star-btn-filled"
                            onClick={() => demoteFromTop(n.id)}
                            title="Move back to shortlist"
                          >
                            ★
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="shortlist-divider">
              <span>Shortlist</span>
            </div>

            {shortlist.length === 0 ? (
              <div className="names-empty">
                No names on the shortlist. Add one below or accept an AI suggestion.
              </div>
            ) : (
              <div className="shortlist-row">
                {shortlist.map((n) => (
                  <div key={n.id} className="shortlist-chip">
                    <span className="shortlist-chip-name">{n.name}</span>
                    {n.origin && (
                      <span className="shortlist-chip-meta">{n.origin}</span>
                    )}
                    <div className="shortlist-chip-actions">
                      <button
                        type="button"
                        className="star-btn"
                        onClick={() => promoteToTop(n.id)}
                        title="Mark as top three"
                      >
                        ☆
                      </button>
                      <button
                        type="button"
                        className="chip-x"
                        onClick={() => removeFromShortlist(n.id)}
                        title="Remove from shortlist"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="add-name-row">
          <input
            type="text"
            className="names-input"
            placeholder="Add a name you love…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addManualName();
            }}
            disabled={!loaded}
          />
          <button
            type="button"
            className="names-btn-primary"
            onClick={() => void addManualName()}
            disabled={!loaded || !newName.trim()}
          >
            Add
          </button>
        </div>
      </section>

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
          <label className="names-field-label">Looking for</label>
          <div className="chip-row">
            {(["boy", "girl", "either"] as NameGender[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`chip ${preferences.gender === g ? "chip-active" : ""}`}
                onClick={() => setGender(g)}
                disabled={!loaded}
              >
                {g === "either" ? "Either" : g === "boy" ? "Boy" : "Girl"}
              </button>
            ))}
          </div>
        </div>

        <div className="names-field">
          <label className="names-field-label" htmlFor="names-notes">
            Notes for the AI
          </label>
          <textarea
            id="names-notes"
            className="names-textarea"
            placeholder="e.g. Portuguese origin, short, easy to pronounce in English and Portuguese, no family names…"
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
              Vote up to add to your shortlist · Vote down to never see again
              {rejectedNames.size > 0 && <> · {rejectedNames.size} excluded</>}
            </p>
          </div>
          <button
            type="button"
            className="names-btn-primary"
            onClick={() => void generateSuggestions()}
            disabled={!loaded || suggestionsLoading}
          >
            {suggestionsLoading ? "Generating…" : "Suggest names"}
          </button>
        </div>

        {suggestionsLoading ? (
          <div className="suggestion-grid">
            {[0, 1].map((i) => (
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
            Click <strong>Suggest names</strong> and the AI will draft ideas based on your preferences.
          </div>
        ) : (
          <div className="suggestion-grid">
            {suggestions.map((s) => (
              <div key={s.id} className="suggestion-card">
                <div className="suggestion-name">{s.name}</div>
                {s.origin && <div className="suggestion-origin">{s.origin}</div>}
                {s.meaning && <div className="suggestion-meaning">{s.meaning}</div>}
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="vote-btn vote-up"
                    onClick={() => void upvoteSuggestion(s.id)}
                    title="Add to shortlist"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="vote-btn vote-down"
                    onClick={() => void downvoteSuggestion(s.id)}
                    title="Don't show again"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
