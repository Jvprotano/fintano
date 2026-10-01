/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrationReport } from './backupV7'
import { inspectBackup } from '../lib/backup'

const inputPath = process.env.FINTANO_BACKUP_PATH
const outputPath = process.env.FINTANO_BACKUP_OUTPUT
const reportPath = process.env.FINTANO_MIGRATION_REPORT

describe.skipIf(!inputPath || !outputPath || !reportPath)('conversão explícita de backup', () => {
  it('preserva o original e grava backup v9 acompanhado do relatório', () => {
    const payload = JSON.parse(readFileSync(inputPath!, 'utf8')) as unknown
    const inspection = inspectBackup(payload)
    const errors = inspection.issues.filter((issue) => issue.severity === 'error')
    expect(errors).toEqual([])

    mkdirSync(dirname(outputPath!), { recursive: true })
    mkdirSync(dirname(reportPath!), { recursive: true })
    writeFileSync(outputPath!, `${JSON.stringify(inspection.backup, null, 2)}\n`, 'utf8')
    writeFileSync(reportPath!, `${JSON.stringify(migrationReport(inspection), null, 2)}\n`, 'utf8')

    expect(JSON.parse(readFileSync(outputPath!, 'utf8')).schemaVersion).toBe(9)
    expect(JSON.parse(readFileSync(reportPath!, 'utf8')).issues).toEqual(inspection.issues)
  })
})
