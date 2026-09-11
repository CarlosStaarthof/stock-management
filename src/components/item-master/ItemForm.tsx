"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { createItemAction, updateItemAction } from "@/app/item-master/actions";
import { initialFormState } from "@/app/item-master/form-state";
import { Field } from "@/components/item-master/Field";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import { ARCHIVED_SUPPLIER_SUFFIX, NO_SUPPLIER, SAVE } from "@/lib/item-master-messages";

/**
 * The item details form (006 AC-7 to AC-10, AC-20).
 *
 * A Client Component for one reason: `useActionState` is what keeps the typed values on
 * the page when the server refuses, and puts `Description is required.` beside the input
 * it names rather than at the top of the screen (AC-8). It still works with JavaScript
 * off, because the action is a server action and the form posts (docs/conventions.md).
 *
 * It decides nothing. It renders the fields, posts them, and renders what came back — the
 * unit kind is derived by the server from the label, and is not an input here (006 § Out
 * of scope).
 */
export type SupplierChoice = { id: string; name: string; active: boolean };
export type ItemTypeChoice = { id: string; name: string };

export type ItemFormValues = {
  description: string;
  supplierId: string;
  itemTypeId: string;
  unitLabel: string;
  notes: string;
};

const CONTROL = "min-h-11 w-full rounded border border-slate-300 px-3 py-2 text-base";

export function ItemForm({
  itemId,
  values,
  suppliers,
  itemTypes,
}: {
  /** `null` on the create screen. */
  itemId: string | null;
  values: ItemFormValues;
  suppliers: SupplierChoice[];
  itemTypes: ItemTypeChoice[];
}): JSX.Element {
  const [state, formAction] = useActionState(
    itemId === null ? createItemAction : updateItemAction,
    initialFormState({ ...values }),
  );

  // The typed values win over the stored ones after a refusal, so nothing is retyped.
  const current: ItemFormValues = {
    description: state.values.description ?? values.description,
    supplierId: state.values.supplierId ?? values.supplierId,
    itemTypeId: state.values.itemTypeId ?? values.itemTypeId,
    unitLabel: state.values.unitLabel ?? values.unitLabel,
    notes: state.values.notes ?? values.notes,
  };

  const errorFor = (field: string): string | null =>
    state.error !== null && state.field === field ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="item-form">
      {itemId === null ? null : <input type="hidden" name="itemId" value={itemId} />}

      {/* A ConflictError names no field, so it renders above the form (006 § UI states). */}
      {state.error !== null && state.field === null ? (
        <p
          data-testid="item-form-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        id="description"
        label="Description"
        error={errorFor("description")}
        errorTestId="description-error"
      >
        <input
          id="description"
          name="description"
          type="text"
          key={`description-${state.attempt}`}
          defaultValue={current.description}
          aria-invalid={errorFor("description") !== null}
          aria-describedby={errorFor("description") === null ? undefined : "description-error"}
          className={CONTROL}
        />
      </Field>

      <Field
        id="supplierId"
        label="Supplier"
        error={errorFor("supplierId")}
        errorTestId="supplierId-error"
      >
        <select
          id="supplierId"
          name="supplierId"
          key={`supplierId-${state.attempt}`}
          defaultValue={current.supplierId}
          aria-invalid={errorFor("supplierId") !== null}
          className={CONTROL}
        >
          <option value="">{NO_SUPPLIER}</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.active ? supplier.name : `${supplier.name} ${ARCHIVED_SUPPLIER_SUFFIX}`}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="itemTypeId"
        label="Type"
        error={errorFor("itemTypeId")}
        errorTestId="itemTypeId-error"
      >
        <select
          id="itemTypeId"
          name="itemTypeId"
          key={`itemTypeId-${state.attempt}`}
          defaultValue={current.itemTypeId}
          aria-invalid={errorFor("itemTypeId") !== null}
          className={CONTROL}
        >
          <option value="">Choose a type</option>
          {itemTypes.map((itemType) => (
            <option key={itemType.id} value={itemType.id}>
              {itemType.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="unitLabel"
        label="Unit label"
        hint="The yard's own words, kept exactly. What it means is derived from it."
      >
        <input
          id="unitLabel"
          name="unitLabel"
          type="text"
          key={`unitLabel-${state.attempt}`}
          defaultValue={current.unitLabel}
          placeholder="20 Kg"
          aria-describedby="unitLabel-hint"
          className={CONTROL}
        />
      </Field>

      <Field
        id="notes"
        label="Notes"
        hint="Clearing this is how a resolved import conflict is recorded."
      >
        <textarea
          id="notes"
          name="notes"
          rows={4}
          key={`notes-${state.attempt}`}
          defaultValue={current.notes}
          aria-describedby="notes-hint"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </Field>

      <div>
        <SubmitButton testId="save-item">{SAVE}</SubmitButton>
      </div>
    </form>
  );
}
