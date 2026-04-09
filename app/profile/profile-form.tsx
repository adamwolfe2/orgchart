'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileFormValues } from '@/lib/profile'
import type { Employee } from '@/lib/types'

import { CustomLinksField } from './custom-links-field'

interface ProfileFormProps {
  employee: Employee
  organizationId: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_BYTES = 2 * 1024 * 1024

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function ProfileForm({ employee, organizationId: _organizationId }: ProfileFormProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const methods = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      position: employee.position ?? '',
      context: employee.context ?? '',
      linkedin_url: employee.linkedin_url ?? '',
      phone: employee.phone ?? '',
      custom_links: employee.custom_links ?? [],
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = methods

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setFileError(null)

    if (!file) {
      setPendingFile(null)
      setPreviewUrl(null)
      return
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('File must be jpeg, png, or webp.')
      setPendingFile(null)
      setPreviewUrl(null)
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setFileError('File must be 2 MB or smaller.')
      setPendingFile(null)
      setPreviewUrl(null)
      return
    }

    setPendingFile(file)
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
  }

  async function onSubmit(values: ProfileFormValues) {
    setStatus('saving')
    setStatusMessage('')

    try {
      let headshotUrl: string | undefined

      // 1. Upload headshot if a new file was chosen
      if (pendingFile) {
        const formData = new FormData()
        formData.append('file', pendingFile)

        const headshotRes = await fetch('/api/profile/headshot', {
          method: 'POST',
          body: formData,
        })

        const headshotJson = await headshotRes.json()
        if (!headshotRes.ok || !headshotJson.success) {
          setStatus('error')
          setStatusMessage(headshotJson.error ?? 'Failed to upload headshot.')
          return
        }

        headshotUrl = headshotJson.data.headshot_url
      }

      // 2. Save profile fields
      const body: Record<string, unknown> = { ...values }
      if (headshotUrl !== undefined) {
        body.headshot_url = headshotUrl
      }

      const profileRes = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const profileJson = await profileRes.json()
      if (!profileRes.ok || !profileJson.success) {
        setStatus('error')
        setStatusMessage(profileJson.error ?? 'Failed to save profile.')
        return
      }

      setStatus('success')
      setStatusMessage('Profile saved.')
      setPendingFile(null)
    } catch (err) {
      setStatus('error')
      setStatusMessage(err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
  }

  const currentHeadshotSrc = previewUrl ?? employee.headshot_url

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Headshot */}
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            {currentHeadshotSrc ? (
              <Image
                src={currentHeadshotSrc}
                alt={`${employee.first_name} ${employee.last_name}`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full object-cover ring-2 ring-slate-200"
                unoptimized={Boolean(previewUrl)}
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600"
              >
                {getInitials(employee.first_name, employee.last_name)}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Profile photo</p>
            <p className="text-xs text-slate-400">jpeg, png, or webp — max 2 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose photo
            </Button>
            {fileError ? (
              <p className="text-xs text-red-500">{fileError}</p>
            ) : null}
            {pendingFile && !fileError ? (
              <p className="text-xs text-slate-500">{pendingFile.name} ready to upload</p>
            ) : null}
          </div>
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <Label htmlFor="position">Position / role</Label>
          <Input
            id="position"
            placeholder="e.g. Head of Engineering"
            aria-invalid={Boolean(errors.position)}
            {...register('position')}
          />
          {errors.position ? (
            <p className="text-xs text-red-500">{errors.position.message}</p>
          ) : null}
        </div>

        {/* Context */}
        <div className="space-y-1.5">
          <Label htmlFor="context">Context</Label>
          <p className="text-xs text-slate-400">
            What do you own / handle? Plain language helps the chat answer questions about you.
          </p>
          <textarea
            id="context"
            rows={6}
            aria-invalid={Boolean(errors.context)}
            className="h-auto w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-4 focus-visible:ring-slate-900/10 aria-invalid:border-red-400 aria-invalid:ring-red-500/20 hover:border-slate-300 disabled:opacity-50"
            placeholder="I own the eng roadmap, run sprint planning, and handle vendor security reviews..."
            {...register('context')}
          />
          {errors.context ? (
            <p className="text-xs text-red-500">{errors.context.message}</p>
          ) : null}
        </div>

        {/* LinkedIn */}
        <div className="space-y-1.5">
          <Label htmlFor="linkedin_url">LinkedIn URL</Label>
          <Input
            id="linkedin_url"
            type="url"
            placeholder="https://linkedin.com/in/yourname"
            aria-invalid={Boolean(errors.linkedin_url)}
            {...register('linkedin_url')}
          />
          {errors.linkedin_url ? (
            <p className="text-xs text-red-500">{errors.linkedin_url.message}</p>
          ) : null}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 555-000-0000"
            aria-invalid={Boolean(errors.phone)}
            {...register('phone')}
          />
          {errors.phone ? (
            <p className="text-xs text-red-500">{errors.phone.message}</p>
          ) : null}
        </div>

        {/* Custom links */}
        <CustomLinksField />

        {/* Status banner */}
        {status === 'success' ? (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {statusMessage}
          </div>
        ) : null}
        {status === 'error' ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {statusMessage}
          </div>
        ) : null}

        {/* Submit */}
        <Button type="submit" disabled={isSubmitting || status === 'saving'}>
          {isSubmitting || status === 'saving' ? 'Saving...' : 'Save profile'}
        </Button>
      </form>
    </FormProvider>
  )
}
