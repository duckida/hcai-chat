"use client";

import { Check, ChevronDown, Star } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/primitives/button";
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuTrigger,
} from "@/components/primitives/menu";
import { cn } from "@/lib/utils";
import { useModels } from "@/stores/models";
import { toggleFavoriteModel, useSettings } from "@/stores/settings";

// The press events that would otherwise start a row press, plus the click that
// would otherwise run the row's action. Down *and* up: React Aria's menu-item
// press-up handler clicks the row itself for any pointerup that bubbles out of
// it, so intercepting only pointerdown would still leave a star mouseup
// selecting the model.
const STAR_PRESS_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup"];

const isStar = (event) =>
  Boolean(event.target?.closest?.("[data-favorite-toggle]"));

/**
 * A starred row is a second copy of a model that is still listed under its
 * provider, and React Aria keys its collection by the item's id. Two live nodes
 * sharing an id do not merge — the second overwrites the first in the key map
 * while the section that owned the first keeps pointing at that key, so the
 * Favorites section walked the provider group's sibling chain and rendered the
 * whole group. Starred rows therefore carry their own id, which `onAction`
 * unwraps again before the choice leaves the picker.
 */
const FAVORITE_ID_PREFIX = "favorite:";

function toFavoriteId(modelId) {
  return `${FAVORITE_ID_PREFIX}${modelId}`;
}

function fromItemId(id) {
  return typeof id === "string" && id.startsWith(FAVORITE_ID_PREFIX)
    ? id.slice(FAVORITE_ID_PREFIX.length)
    : id;
}

/**
 * One model row, with a star that toggles the favorites list.
 *
 * React Aria starts the row's press from any pointerdown that bubbles out of
 * the item and treats the row as the press target even when the star was hit,
 * so a plain nested button would also select the model and close the menu
 * (verified in a real browser, not just jsdom). The star's press events are
 * therefore stopped by **native** capture listeners on the row: React Aria
 * filters out `on*Capture` props, and React's own delegation runs at the root,
 * so a listener attached to the row is the only place that can intercept the
 * event before React Aria ever sees it. The toggle rides the click, which is
 * intercepted the same way. `tabIndex={-1}` keeps stars out of the menu's
 * roving focus, so the arrows still walk models.
 */
function ModelRow({ model, itemId = model.id, selected, favorite }) {
  const rowRef = useCallback(
    (row) => {
      if (!row) return undefined;

      const swallow = (event) => {
        if (!isStar(event)) return;
        event.stopPropagation();
      };
      const toggle = (event) => {
        if (!isStar(event)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFavoriteModel(model.id);
      };

      for (const type of STAR_PRESS_EVENTS) {
        row.addEventListener(type, swallow, true);
      }
      row.addEventListener("click", toggle, true);
      return () => {
        for (const type of STAR_PRESS_EVENTS) {
          row.removeEventListener(type, swallow, true);
        }
        row.removeEventListener("click", toggle, true);
      };
    },
    [model.id],
  );

  return (
    <MenuItem
      ref={rowRef}
      id={itemId}
      textValue={model.name}
      className="text-[13px] rounded-lg py-2.5 px-4"
    >
      <span className="truncate">{model.name}</span>
      <button
        type="button"
        data-favorite-toggle=""
        tabIndex={-1}
        aria-label={
          favorite
            ? `Remove ${model.name} from favorites`
            : `Add ${model.name} to favorites`
        }
        aria-pressed={favorite}
        className={cn(
          // Padding carries the tap target and the negative margin cancels it,
          // so the *layout* box stays the 20px it always was while the
          // hit-testable border box is 36px: a 20px star is a fifth of the
          // touch target a finger needs, and the miss lands on the row, which
          // selects the model and closes the picker. The margins are named per
          // side rather than `-m-2` because the shorthand sets `margin-left`
          // too, which lands after `ml-auto` in the stylesheet and silently
          // un-right-aligns the star.
          "ml-auto shrink-0 rounded-md p-2.5 -my-2 -mr-2 transition-colors",
          favorite
            ? "text-amber-500"
            : "text-muted-foreground/50 hover:text-foreground",
        )}
      >
        <Star className={cn("size-4", favorite && "fill-current")} />
      </button>
      {selected && <Check className="h-4 w-4 shrink-0" />}
    </MenuItem>
  );
}

/**
 * Grouped model picker: one provider group per section at every breakpoint.
 *
 * The previous version branched into a desktop submenu and a tap-to-expand
 * mobile accordion — two markup paths to keep in sync, and a nested
 * interaction that had to be relearned per size. A flat grouped list is
 * shorter, scrolls, and takes typeahead (type "gpt" to jump) on both.
 */
export default function ModelPicker({
  value,
  onChange,
  triggerClassName = "",
  align = "start",
  emptyLabel = "Model",
  ariaLabelledBy,
}) {
  const groupedModels = useModels((s) => s.grouped);
  const favoriteIds = useSettings((s) => s.favoriteModels) || [];
  const hasModels = Object.keys(groupedModels).length > 0;
  const allModels = Object.values(groupedModels).flat();
  const selectedName =
    allModels.find((m) => m.id === value)?.name || emptyLabel;
  // Resolve starred ids against the catalog so a model that has since left it
  // is skipped rather than rendered as a blank row.
  const favoriteModels = favoriteIds
    .map((id) => allModels.find((m) => m.id === id))
    .filter(Boolean);

  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "justify-between w-auto min-w-[64px] sm:min-w-[100px] border-none shadow-none hover:bg-accent transition-colors focus-visible:ring-0 font-bold text-[12px] sm:text-[14px] text-foreground bg-transparent gap-0.5 sm:gap-2 h-7 sm:h-9 px-1 sm:px-3 rounded-xl",
          triggerClassName,
        )}
      >
        <span className="truncate min-w-0 max-w-[40px] sm:max-w-[200px]">
          {selectedName}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </Button>

      <MenuContent
        align={align}
        ariaLabel="Models"
        onAction={(id) => onChange?.(fromItemId(id))}
        className="rounded-2xl border border-border shadow-2xl p-1 min-w-[220px] max-h-[60vh]"
      >
        {hasModels ? (
          <>
            {favoriteModels.length > 0 && (
              <MenuGroup label="Favorites">
                {favoriteModels.map((model) => (
                  <ModelRow
                    key={`favorite-${model.id}`}
                    itemId={toFavoriteId(model.id)}
                    model={model}
                    selected={value === model.id}
                    favorite
                  />
                ))}
              </MenuGroup>
            )}
            {Object.entries(groupedModels).map(([provider, models]) => (
              <MenuGroup key={provider} label={provider}>
                {models.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    selected={value === model.id}
                    favorite={favoriteIds.includes(model.id)}
                  />
                ))}
              </MenuGroup>
            ))}
          </>
        ) : (
          <MenuItem
            id="__loading"
            isDisabled
            textValue="Loading models"
            className="text-[13px] rounded-lg py-2.5 px-4"
          >
            Loading models...
          </MenuItem>
        )}
      </MenuContent>
    </MenuTrigger>
  );
}
