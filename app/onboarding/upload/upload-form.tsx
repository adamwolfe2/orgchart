'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface HeaderMapping {
  raw: string
  canonical: string | null
}

interface UploadRowIssue {
  row?: number
  message: string
}

interface UploadResponse {
  success: boolean
  data?: {
    count: number
    headerMappings?: HeaderMapping[]
    warnings?: UploadRowIssue[]
    unmappedHeaders?: string[]
  }
  error?: string
  errors?: UploadRowIssue[]
  warnings?: UploadRowIssue[]
  headerMappings?: HeaderMapping[]
  unmappedHeaders?: string[]
  missingRequired?: string[]
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export function UploadForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [count, setCount] = useState<number>(0)
  const [errors, setErrors] = useState<UploadRowIssue[]>([])
  const [warnings, setWarnings] = useState<UploadRowIssue[]>([])
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [headerMappings, setHeaderMappings] = useState<HeaderMapping[]>([])
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[]>([])

  function reset() {
    setStatus('idle')
    setErrors([])
    setWarnings([])
    setGeneralError(null)
    setHeaderMappings([])
    setUnmappedHeaders([])
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    reset()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setGeneralError('Please choose a CSV file to upload.')
      return
    }

    setStatus('uploading')
    setErrors([])
    setWarnings([])
    setGeneralError(null)
    setHeaderMappings([])
    setUnmappedHeaders([])

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/employees/upload', {
        method: 'POST',
        body: formData,
      })

      let payload: UploadResponse | null = null
      try {
        payload = (await response.json()) as UploadResponse
      } catch {
        payload = null
      }

      if (!response.ok || !payload?.success) {
        setStatus('error')
        const rowErrors = payload?.errors ?? []
        setErrors(rowErrors)
        setWarnings(payload?.warnings ?? [])
        setHeaderMappings(payload?.headerMappings ?? [])
        setUnmappedHeaders(payload?.unmappedHeaders ?? [])
        setGeneralError(
          payload?.error === 'validation'
            ? 'Your file is missing required columns. See details below.'
            : (payload?.error ??
                (rowErrors.length === 0
                  ? 'Upload failed. Please check your file and try again.'
                  : null)),
        )
        return
      }

      setCount(payload.data?.count ?? 0)
      setHeaderMappings(payload.data?.headerMappings ?? [])
      setWarnings(payload.data?.warnings ?? [])
      setUnmappedHeaders(payload.data?.unmappedHeaders ?? [])
      setStatus('success')
      router.refresh()
      router.push('/chart')
    } catch {
      setStatus('error')
      setGeneralError(
        'Upload failed. Please check your connection and try again.',
      )
    }
  }

  const isUploading = status === 'uploading'
  const isSuccess = status === 'success'
  const mappedFields = headerMappings.filter((m) => m.canonical)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csv-file">Employee CSV</Label>
        <Input
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={isUploading || isSuccess}
          className="cursor-pointer py-2.5"
        />
        {file ? (
          <p className="text-xs text-slate-500">
            Selected:{' '}
            <span className="font-medium text-slate-700">{file.name}</span>
          </p>
        ) : null}
      </div>

      {generalError ? (
        <p role="alert" className="text-sm text-red-600">
          {generalError}
        </p>
      ) : null}

      {mappedFields.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">
            Detected columns
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {mappedFields.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-900">{m.raw}</span>
                <span className="text-slate-400">{'->'}</span>
                <span className="font-mono text-slate-700">{m.canonical}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unmappedHeaders.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            Unrecognized columns (ignored)
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {unmappedHeaders.join(', ')}
          </p>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-medium text-red-900">Errors</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-red-800">
            {errors.map((error, index) => (
              <li key={index}>
                {typeof error.row === 'number' && error.row > 0
                  ? `Row ${error.row}: `
                  : ''}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            {isSuccess
              ? `Uploaded with ${warnings.length} note${warnings.length === 1 ? '' : 's'}`
              : `${warnings.length} row${warnings.length === 1 ? '' : 's'} to review`}
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-amber-800">
            {warnings.map((warning, index) => (
              <li key={index}>
                {typeof warning.row === 'number' && warning.row > 0
                  ? `Row ${warning.row}: `
                  : ''}
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isSuccess ? (
        <p role="status" className="text-sm text-slate-700">
          Uploaded {count} employees, redirecting...
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!file || isUploading || isSuccess}
        className="w-full"
        size="lg"
      >
        {isUploading ? 'Uploading...' : isSuccess ? 'Uploaded' : 'Upload'}
      </Button>
    </form>
  )
}
