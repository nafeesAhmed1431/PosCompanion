import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'

// Generic infra, no app-specific knowledge (it doesn't know what secret
// it's storing, or why) — safe to copy into another Electron project as-is.
// Encrypts a single string value via safeStorage (OS-keychain-backed, e.g.
// DPAPI on Windows) into a file under Electron's userData directory. A
// plain SQLite row or JSON file on disk is a single copyable blob with no
// OS-level protection; this makes the file on disk useless without also
// being logged into the same OS user account on the same machine.
export function createSecureFileStore(filename) {
  function filePath() {
    return path.join(app.getPath('userData'), filename)
  }

  function save(value) {
    const target = filePath()
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(target, safeStorage.encryptString(value))
      return
    }

    // Falls back to plaintext rather than crashing the app — e.g. some
    // Linux distros without a keyring daemon report encryption unavailable.
    // Logged loudly so this is never a silent security regression.
    console.warn(
      `[secure-file-store] safeStorage.isEncryptionAvailable() is false — storing "${filename}" ` +
        'as plain text. Investigate the OS keychain/credential store on this machine; ' +
        'the value is still saved, just less securely.'
    )
    fs.writeFileSync(target, value, 'utf8')
  }

  function read() {
    const target = filePath()
    if (!fs.existsSync(target)) return null

    const buffer = fs.readFileSync(target)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buffer)
      } catch {
        // Written before encryption was available, or by a different OS
        // user/machine (e.g. a copied userData folder) — unreadable, not a
        // crash-worthy error. Caller sees this the same as "nothing stored."
        return null
      }
    }
    return buffer.toString('utf8')
  }

  function clear() {
    const target = filePath()
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }

  return { save, read, clear }
}
