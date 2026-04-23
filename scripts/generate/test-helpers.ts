import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-gen-test-'))
}

export function writeFile(
  dir: string,
  relativePath: string,
  content: string,
): string {
  const full = path.join(dir, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
  return full
}
