"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  createItemAction,
  createSectionAction,
  deleteItemAction,
  deleteSectionAction,
  publishMenuAction,
  reorderItemsAction,
  reorderSectionsAction,
  unpublishMenuAction,
  updateItemAction,
  updateMenuAction,
} from "./actions";
import { EMPTY_FORM } from "./state";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronRight,
  IconDrag,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { money } from "@/lib/format";
import { DIETARY_TAGS } from "@/lib/dietary";

/* Plain, serialisable shapes — the page maps rows into these. */

export interface ItemView {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number | null;
  dietaryTags: string[];
  isEightySixed: boolean;
  autoRestore: boolean;
  photoStatus: string | null;
}

export interface SectionView {
  id: string;
  name: string;
  note: string | null;
  items: ItemView[];
}

export interface MenuView {
  id: string;
  name: string;
  status: string;
  daypartStart: string;
  daypartEnd: string;
  daypartDays: number[];
  publishedAt: string | null;
  sections: SectionView[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Feedback({ state }: { state: { error: string | null; ok: string | null } }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{ margin: 0, color: state.error ? "#c05a3e" : "#5f7e4e" }}
    >
      {state.error ?? state.ok}
    </p>
  );
}

/**
 * Reorder within a list.
 *
 * Pointer-drag on the handle *and* arrow buttons, because a gesture is never the
 * only path (DESIGN_LANGUAGE) and because a line cook with wet hands will hit the
 * arrows. Both commit through the same server action.
 */
function useReorder(ids: string[], commit: (ordered: string[]) => Promise<void>) {
  const [order, setOrder] = useOptimistic(ids, (_state: string[], next: string[]) => next);
  const [, startTransition] = useTransition();
  const dragging = useRef<{ id: string; startY: number; rowHeight: number } | null>(null);

  const apply = (next: string[]) => {
    startTransition(async () => {
      setOrder(next);
      await commit(next);
    });
  };

  const move = (id: string, delta: number) => {
    const current = [...order];
    const from = current.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= current.length) return;
    current.splice(to, 0, current.splice(from, 1)[0]);
    apply(current);
  };

  const onPointerDown = (id: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
    const row = (event.currentTarget.closest("[data-row]") as HTMLElement | null) ?? null;
    if (!row) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { id, startY: event.clientY, rowHeight: row.offsetHeight || 64 };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragging.current;
    if (!drag) return;
    const steps = Math.round((event.clientY - drag.startY) / drag.rowHeight);
    if (steps === 0) return;
    const current = [...order];
    const from = current.indexOf(drag.id);
    const to = Math.min(current.length - 1, Math.max(0, from + (steps > 0 ? 1 : -1)));
    if (to === from) return;
    current.splice(to, 0, current.splice(from, 1)[0]);
    drag.startY = event.clientY;
    startTransition(() => setOrder(current));
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = null;
    apply([...order]);
  };

  return { order, move, onPointerDown, onPointerMove, onPointerUp };
}

function DragHandle({
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="toggle-86"
      style={{ borderColor: "transparent", touchAction: "none", cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <IconDrag size={20} />
    </button>
  );
}

function ArrowButtons({
  onUp,
  onDown,
  first,
  last,
  what,
}: {
  onUp: () => void;
  onDown: () => void;
  first: boolean;
  last: boolean;
  what: string;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button
        type="button"
        className="toggle-86"
        aria-label={`Move ${what} up`}
        disabled={first}
        onClick={onUp}
        style={{ opacity: first ? 0.35 : 1 }}
      >
        <IconArrowUp size={18} />
      </button>
      <button
        type="button"
        className="toggle-86"
        aria-label={`Move ${what} down`}
        disabled={last}
        onClick={onDown}
        style={{ opacity: last ? 0.35 : 1 }}
      >
        <IconArrowDown size={18} />
      </button>
    </span>
  );
}

/* ----------------------------------------------------------------- one dish */

function ItemEditor({ item }: { item: ItemView }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateItemAction, EMPTY_FORM);
  const [deleteState, deleteAction] = useActionState(deleteItemAction, EMPTY_FORM);
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          width: "100%",
          background: "transparent",
          border: 0,
          padding: 0,
          textAlign: "left",
          color: "inherit",
          cursor: "pointer",
          minHeight: 44,
        }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className={`t-dish${item.isEightySixed ? " is-86" : ""}`} style={{ display: "block" }}>
            <span className="dish-name">{item.name}</span>
          </span>
          {item.description ? (
            <span className="t-secondary clamp-2" style={{ display: "block", marginTop: 2 }}>
              {item.description}
            </span>
          ) : null}
          <span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {item.dietaryTags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
            {item.isEightySixed ? (
              <span className="pill pill-86">
                <span className="pill-dot" />
                86&apos;d
              </span>
            ) : null}
            {item.costCents === null ? (
              <span className="pill pill-draft">
                <span className="pill-dot" />
                No plate cost
              </span>
            ) : null}
            {item.photoStatus === "approved" ? (
              <span className="pill pill-ok">
                <span className="pill-dot" />
                Photo
              </span>
            ) : item.photoStatus === "ready" ? (
              <span className="pill pill-enhancing">
                <span className="pill-dot" />
                Photo waiting
              </span>
            ) : null}
          </span>
        </span>
        <span className="t-data" style={{ flex: "0 0 auto", paddingTop: 2 }}>
          {money(item.priceCents)}
        </span>
        <span
          style={{
            flex: "0 0 auto",
            paddingTop: 2,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 200ms",
            color: "var(--fg-3)",
          }}
        >
          <IconChevronRight size={18} />
        </span>
      </button>

      {open ? (
        <form action={action} style={{ display: "grid", gap: 12, marginTop: 16, marginBottom: 8 }}>
          <input type="hidden" name="itemId" value={item.id} />
          <label style={{ display: "grid", gap: 6 }}>
            <span className="t-label">Dish name</span>
            <input className="input" name="name" defaultValue={item.name} required />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="t-label">Description</span>
            <textarea
              className="textarea"
              name="description"
              defaultValue={item.description ?? ""}
              placeholder="chili honey, pickled fennel"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="t-label">Price</span>
              <input
                className="input input-data"
                name="price"
                inputMode="decimal"
                defaultValue={(item.priceCents / 100).toFixed(2)}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="t-label">Plate cost</span>
              <input
                className="input input-data"
                name="cost"
                inputMode="decimal"
                placeholder="—"
                defaultValue={item.costCents === null ? "" : (item.costCents / 100).toFixed(2)}
              />
            </label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="t-label" style={{ marginBottom: 8 }}>
              Dietary
            </legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DIETARY_TAGS.map((tag) => (
                <label key={tag} className="chip" style={{ cursor: "pointer", gap: 8 }}>
                  <input
                    type="checkbox"
                    name="tags"
                    value={tag}
                    defaultChecked={item.dietaryTags.includes(tag)}
                    style={{ accentColor: "#c05a3e" }}
                  />
                  {tag}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="chip" style={{ cursor: "pointer", gap: 10, width: "fit-content" }}>
            <input
              type="checkbox"
              name="autoRestore"
              defaultChecked={item.autoRestore}
              style={{ accentColor: "#c05a3e" }}
            />
            Auto-restore at 4am after an 86
          </label>

          <Feedback state={state} />
          <Feedback state={deleteState} />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save dish"}
            </button>
            {confirming ? (
              <>
                <button
                  className="btn btn-secondary"
                  type="submit"
                  formAction={deleteAction}
                  style={{ color: "#c05a3e" }}
                >
                  Yes, remove it
                </button>
                <button
                  className="btn-quiet"
                  type="button"
                  onClick={() => setConfirming(false)}
                  style={{ color: "var(--fg-2)" }}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Remove ${item.name}`}
              >
                <IconTrash size={18} /> Remove
              </button>
            )}
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- a section */

function AddItemForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(createItemAction, EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (!open) {
    return (
      <button className="btn-quiet" type="button" onClick={() => setOpen(true)} style={{ marginTop: 8 }}>
        <IconPlus size={18} /> Add a dish
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <input className="input" name="name" placeholder="Crispy Half Chicken" required />
      <input className="input" name="description" placeholder="chili honey, pickled fennel" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input
          className="input input-data"
          name="price"
          inputMode="decimal"
          placeholder="24.00"
          required
          aria-label="Price"
        />
        <input
          className="input input-data"
          name="cost"
          inputMode="decimal"
          placeholder="Plate cost"
          aria-label="Plate cost"
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {DIETARY_TAGS.map((tag) => (
          <label key={tag} className="chip" style={{ cursor: "pointer", gap: 8 }}>
            <input type="checkbox" name="tags" value={tag} style={{ accentColor: "#c05a3e" }} />
            {tag}
          </label>
        ))}
      </div>
      <Feedback state={state} />
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add dish"}
        </button>
        <button className="btn-quiet" type="button" onClick={() => setOpen(false)} style={{ color: "var(--fg-2)" }}>
          Done
        </button>
      </div>
    </form>
  );
}

function SectionBlock({
  section,
  reorderControls,
}: {
  section: SectionView;
  reorderControls: React.ReactNode;
}) {
  const [deleteState, deleteAction] = useActionState(deleteSectionAction, EMPTY_FORM);
  const [confirming, setConfirming] = useState(false);
  const byId = new Map(section.items.map((i) => [i.id, i]));
  const reorder = useReorder(
    section.items.map((i) => i.id),
    (ordered) => reorderItemsAction(section.id, ordered),
  );

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {reorderControls}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="t-label" style={{ margin: 0 }}>
            {section.name}
          </h3>
          {section.note ? (
            <p className="t-secondary" style={{ margin: 0, marginTop: 4 }}>
              {section.note}
            </p>
          ) : null}
        </div>
        {confirming ? (
          <form action={deleteAction} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="sectionId" value={section.id} />
            <button className="btn-quiet" type="submit">
              Remove section
            </button>
            <button className="btn-quiet" type="button" onClick={() => setConfirming(false)} style={{ color: "var(--fg-2)" }}>
              Keep
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="toggle-86"
            aria-label={`Remove section ${section.name}`}
            onClick={() => setConfirming(true)}
            style={{ borderColor: "transparent" }}
          >
            <IconTrash size={18} />
          </button>
        )}
      </div>
      <Feedback state={deleteState} />

      {section.items.length === 0 ? (
        <p className="t-secondary hairline-t" style={{ paddingTop: 16, marginTop: 12 }}>
          Nothing in {section.name} yet.
        </p>
      ) : (
        <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {reorder.order.map((id, index) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li key={id} className="row" data-row>
                <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 auto" }}>
                  <DragHandle
                    label={`Reorder ${item.name}`}
                    onPointerDown={reorder.onPointerDown(id)}
                    onPointerMove={reorder.onPointerMove}
                    onPointerUp={reorder.onPointerUp}
                  />
                  <ArrowButtons
                    what={item.name}
                    first={index === 0}
                    last={index === reorder.order.length - 1}
                    onUp={() => reorder.move(id, -1)}
                    onDown={() => reorder.move(id, 1)}
                  />
                </span>
                <ItemEditor item={item} />
              </li>
            );
          })}
        </ul>
      )}

      <AddItemForm sectionId={section.id} />
    </section>
  );
}

function AddSectionForm({ menuId }: { menuId: string }) {
  const [state, action, pending] = useActionState(createSectionAction, EMPTY_FORM);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} style={{ display: "grid", gap: 12, marginTop: 32 }}>
      <input type="hidden" name="menuId" value={menuId} />
      <p className="t-label" style={{ margin: 0 }}>
        New section
      </p>
      <input className="input" name="name" placeholder="Starters" required />
      <input className="input" name="note" placeholder="add a side for $5" />
      <Feedback state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        <IconPlus size={18} /> {pending ? "Adding…" : "Add section"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ a menu */

function DaypartForm({ menu }: { menu: MenuView }) {
  const [state, action, pending] = useActionState(updateMenuAction, EMPTY_FORM);
  return (
    <form action={action} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <input type="hidden" name="menuId" value={menu.id} />
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Menu name</span>
        <input className="input" name="name" defaultValue={menu.name} required />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Served from</span>
          <input
            className="input input-data"
            name="start"
            type="time"
            defaultValue={menu.daypartStart}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Until</span>
          <input className="input input-data" name="end" type="time" defaultValue={menu.daypartEnd} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ marginBottom: 8 }}>
          Days (none = every day)
        </legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAY_LABELS.map((label, index) => (
            <label key={label} className="chip" style={{ cursor: "pointer", gap: 8 }}>
              <input
                type="checkbox"
                name="days"
                value={index}
                defaultChecked={menu.daypartDays.includes(index)}
                style={{ accentColor: "#c05a3e" }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="t-secondary" style={{ margin: 0 }}>
        Leave both times blank for an always-available menu. An end time earlier than the start
        crosses midnight.
      </p>
      <Feedback state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save menu settings"}
      </button>
    </form>
  );
}

export function MenuEditor({ menu, publicUrl }: { menu: MenuView; publicUrl: string }) {
  const [publishState, publishAction, publishing] = useActionState(publishMenuAction, EMPTY_FORM);
  const [unpublishState, unpublishAction] = useActionState(unpublishMenuAction, EMPTY_FORM);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const byId = new Map(menu.sections.map((s) => [s.id, s]));
  const reorder = useReorder(
    menu.sections.map((s) => s.id),
    (ordered) => reorderSectionsAction(menu.id, ordered),
  );
  const itemCount = menu.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <section className={publishState.ok ? "publish-wipe" : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="t-h2" style={{ margin: 0 }}>
          {menu.name}
        </h2>
        {menu.status === "live" ? (
          <span className="pill pill-live">
            <span className="pill-dot" />
            Live
          </span>
        ) : (
          <span className="pill pill-draft">
            <span className="pill-dot" />
            Draft
          </span>
        )}
        <button
          className="btn-quiet"
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          {settingsOpen ? "Hide settings" : "Menu settings"}
        </button>
      </div>

      <p className="t-secondary" style={{ marginTop: 8 }}>
        <span className="t-data">{itemCount}</span> {itemCount === 1 ? "dish" : "dishes"}
        {menu.status === "live" ? (
          <>
            {" · "}
            <a href={publicUrl} target="_blank" rel="noreferrer" style={{ color: "#c05a3e" }}>
              see the guest page
            </a>
          </>
        ) : null}
      </p>

      {settingsOpen ? <DaypartForm menu={menu} /> : null}

      {menu.sections.length === 0 ? (
        <p className="t-secondary hairline-t" style={{ paddingTop: 16, marginTop: 16 }}>
          No sections yet. Starters, Mains, Desserts — whatever the menu actually says.
        </p>
      ) : (
        reorder.order.map((id, index) => {
          const section = byId.get(id);
          if (!section) return null;
          return (
            <div key={id} data-row>
              <SectionBlock
                section={section}
                reorderControls={
                  <span style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                    <DragHandle
                      label={`Reorder section ${section.name}`}
                      onPointerDown={reorder.onPointerDown(id)}
                      onPointerMove={reorder.onPointerMove}
                      onPointerUp={reorder.onPointerUp}
                    />
                    <ArrowButtons
                      what={`section ${section.name}`}
                      first={index === 0}
                      last={index === reorder.order.length - 1}
                      onUp={() => reorder.move(id, -1)}
                      onDown={() => reorder.move(id, 1)}
                    />
                  </span>
                }
              />
            </div>
          );
        })
      )}

      <AddSectionForm menuId={menu.id} />

      <div className="sticky-action" style={{ marginTop: 32 }}>
        <form action={publishAction} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="menuId" value={menu.id} />
          <button className="btn btn-primary btn-block" type="submit" disabled={publishing}>
            {publishing ? "Publishing…" : menu.status === "live" ? "Publish changes" : "Publish menu"}
          </button>
        </form>
        {publishState.ok ? (
          <p className="t-secondary" role="status" style={{ marginTop: 8, color: "#5f7e4e" }}>
            <IconCheck size={16} /> {publishState.ok}
          </p>
        ) : null}
        {publishState.error ? (
          <p className="t-secondary" role="alert" style={{ marginTop: 8, color: "#c05a3e" }}>
            {publishState.error}
          </p>
        ) : null}
        {menu.status === "live" ? (
          <form action={unpublishAction}>
            <input type="hidden" name="menuId" value={menu.id} />
            <button className="btn-quiet" type="submit" style={{ color: "var(--fg-2)" }}>
              Take this menu off the QR page
            </button>
          </form>
        ) : null}
        <Feedback state={unpublishState} />
      </div>
    </section>
  );
}
