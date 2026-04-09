'use client'

import { useFieldArray, useFormContext } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProfileFormValues } from '@/lib/profile-schema'

const MAX_LINKS = 10

/**
 * Dynamic field array for custom contact links.
 * Must be rendered inside a react-hook-form <FormProvider>.
 */
export function CustomLinksField() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProfileFormValues>()

  const { fields, append, remove } = useFieldArray<ProfileFormValues>({
    name: 'custom_links',
  })

  function addLink() {
    append({ label: '', url: '' })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Custom links
        </p>
        {fields.length < MAX_LINKS ? (
          <Button type="button" variant="ghost" size="sm" onClick={addLink}>
            + Add link
          </Button>
        ) : null}
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-slate-400">No custom links yet.</p>
      ) : null}

      {fields.map((field, index) => {
        const labelError = errors.custom_links?.[index]?.label?.message
        const urlError = errors.custom_links?.[index]?.url?.message

        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex flex-1 gap-2">
              <div className="w-36 shrink-0">
                <Label htmlFor={`custom_links.${index}.label`} className="sr-only">
                  Label
                </Label>
                <Input
                  id={`custom_links.${index}.label`}
                  placeholder="Label"
                  aria-invalid={Boolean(labelError)}
                  {...register(`custom_links.${index}.label`)}
                />
                {labelError ? (
                  <p className="mt-1 text-xs text-red-500">{labelError}</p>
                ) : null}
              </div>
              <div className="flex-1">
                <Label htmlFor={`custom_links.${index}.url`} className="sr-only">
                  URL
                </Label>
                <Input
                  id={`custom_links.${index}.url`}
                  placeholder="https://..."
                  aria-invalid={Boolean(urlError)}
                  {...register(`custom_links.${index}.url`)}
                />
                {urlError ? (
                  <p className="mt-1 text-xs text-red-500">{urlError}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove link ${index + 1}`}
              className="mt-2.5 shrink-0 text-slate-400 transition-colors hover:text-red-500"
            >
              &times;
            </button>
          </div>
        )
      })}
    </div>
  )
}
