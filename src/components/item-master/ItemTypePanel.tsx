"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { createItemTypeAction } from "@/app/item-master/actions";
import { initialFormState } from "@/app/item-master/form-state";
import { Field } from "@/components/item-master/Field";
import { SubmitButton } from "@/components/item-master/SubmitButton";

/**
 * Create an item type (006 AC-27).
 *
 * There is no `active` field and no archive control here, and there cannot be one: Part 3
 * gives `ItemType` no such column and spec 006 adds no migration. A type nothing uses is
 * deleted; a type something uses is kept.
 */
export function ItemTypePanel(): JSX.Element {
  const [state, formAction] = useActionState(
    createItemTypeAction,
    initialFormState({ code: "", name: "" }),
  );

  const errorFor = (field: string): string | null =>
    state.error !== null && state.field === field ? state.error : null;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" data-testid="create-type-form">
      {state.error !== null && state.field === null ? (
        <p
          data-testid="type-form-error"
          role="alert"
          className="w-full rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      {/* "New type code", not "Code": every row of the table below has a Code input of
          its own, and a label that is unique on the page is a label a person can act on
          out loud. */}
      <Field id="type-code" label="New type code" error={errorFor("code")} errorTestId="type-code-error">
        <input
          id="type-code"
          name="code"
          type="text"
          key={`code-${state.attempt}`}
          defaultValue={state.values.code ?? ""}
          aria-invalid={errorFor("code") !== null}
          className="min-h-11 w-40 max-w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </Field>

      <Field id="type-name" label="New type name" error={errorFor("name")} errorTestId="type-name-error">
        <input
          id="type-name"
          name="name"
          type="text"
          key={`name-${state.attempt}`}
          defaultValue={state.values.name ?? ""}
          aria-invalid={errorFor("name") !== null}
          className="min-h-11 w-56 max-w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </Field>

      <SubmitButton testId="create-type">Add type</SubmitButton>
    </form>
  );
}
