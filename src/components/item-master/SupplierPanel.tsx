"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { createSupplierAction } from "@/app/item-master/actions";
import { initialFormState } from "@/app/item-master/form-state";
import { Field } from "@/components/item-master/Field";
import { SubmitButton } from "@/components/item-master/SubmitButton";

/**
 * Create a supplier (006 AC-25).
 *
 * A Client Component for the same single reason the item form is one: an empty name and a
 * duplicate name must come back beside the input with what was typed still in it.
 * Renaming, archiving, restoring and deleting are ordinary Server-Component forms on the
 * page, because none of them has a value worth keeping across a refusal.
 */
export function SupplierPanel(): JSX.Element {
  const [state, formAction] = useActionState(createSupplierAction, initialFormState({ name: "" }));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" data-testid="create-supplier-form">
      <Field
        id="supplier-name"
        label="Supplier name"
        error={state.error}
        errorTestId="supplier-name-error"
      >
        <input
          id="supplier-name"
          name="name"
          type="text"
          key={`name-${state.attempt}`}
          defaultValue={state.values.name ?? ""}
          aria-invalid={state.error !== null}
          className="min-h-11 w-64 max-w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </Field>

      <SubmitButton testId="create-supplier">Add supplier</SubmitButton>
    </form>
  );
}
