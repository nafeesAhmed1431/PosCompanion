import { randomUUID } from 'crypto'
import { printersRepository } from '../db/repositories/printersRepository.js'

// connection_config shape per type (judgment call, documented for the
// renderer form and any future ESC/POS transport implementation):
//   usb:     { vendorId, productId }
//   serial:  { path, baudRate }
//   network: { ip, port }
// Stored as a JSON TEXT column in SQLite (see migration 002) — this service
// is the single place that (de)serializes it, so every repository row it
// hands back has connection_config as a real object, never a raw string.
const VALID_TYPES = ['usb', 'serial', 'network']
const VALID_TICKET_TYPES = ['receipt', 'kitchen']

function deserialize(row) {
  if (!row) return row
  let connectionConfig = {}
  try {
    connectionConfig = JSON.parse(row.connection_config || '{}')
  } catch {
    connectionConfig = {}
  }
  return {
    ...row,
    connection_config: connectionConfig,
    is_default: !!row.is_default
  }
}

function listPrinters() {
  return printersRepository.findAll().map(deserialize)
}

function getPrinter(id) {
  return deserialize(printersRepository.findById(id))
}

function validate({ name, type, ticket_type: ticketType }) {
  if (!name || !name.trim()) throw new Error('Printer name is required.')
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Printer type must be one of: ${VALID_TYPES.join(', ')}.`)
  }
  if (!VALID_TICKET_TYPES.includes(ticketType)) {
    throw new Error(`Ticket type must be one of: ${VALID_TICKET_TYPES.join(', ')}.`)
  }
}

// Only one default printer is allowed per ticket_type (receipt vs kitchen)
// — enforced here, not at the DB layer, since it's a small cross-row
// business rule rather than a structural constraint. Clearing the previous
// default happens in the same synchronous better-sqlite3 call chain, so
// there's no window where two printers are briefly both marked default.
function clearOtherDefaults(ticketType, exceptId) {
  printersRepository
    .findAll()
    .filter((p) => p.ticket_type === ticketType && p.is_default && p.id !== exceptId)
    .forEach((p) => printersRepository.upsert({ ...p, is_default: 0 }))
}

function createPrinter(input) {
  validate(input)
  const id = randomUUID()
  const isDefault = !!input.is_default

  if (isDefault) clearOtherDefaults(input.ticket_type, id)

  return deserialize(
    printersRepository.upsert({
      id,
      name: input.name.trim(),
      type: input.type,
      connection_config: JSON.stringify(input.connection_config ?? {}),
      ticket_type: input.ticket_type,
      is_default: isDefault ? 1 : 0
    })
  )
}

function updatePrinter(id, input) {
  const existing = printersRepository.findById(id)
  if (!existing) throw new Error('Printer not found.')

  const merged = {
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    ticket_type: input.ticket_type ?? existing.ticket_type,
    connection_config: input.connection_config !== undefined ? input.connection_config : JSON.parse(existing.connection_config || '{}'),
    is_default: input.is_default !== undefined ? !!input.is_default : !!existing.is_default
  }
  validate(merged)

  if (merged.is_default) clearOtherDefaults(merged.ticket_type, id)

  return deserialize(
    printersRepository.upsert({
      id,
      name: merged.name.trim(),
      type: merged.type,
      connection_config: JSON.stringify(merged.connection_config),
      ticket_type: merged.ticket_type,
      is_default: merged.is_default ? 1 : 0
    })
  )
}

function deletePrinter(id) {
  printersRepository.remove(id)
}

// Stub — the real ESC/POS transport (USB/serial/network) is Phase 6. This
// deliberately reports failure rather than faking a success, per the plan.
function testPrint(id) {
  const printer = printersRepository.findById(id)
  if (!printer) throw new Error('Printer not found.')
  return { success: false, message: 'Printing not yet implemented (coming in a later phase).' }
}

export const printersService = {
  listPrinters,
  getPrinter,
  createPrinter,
  updatePrinter,
  deletePrinter,
  testPrint
}
