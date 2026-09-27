// CHARMM prints thousands of lines; for a UI error message we only want the
// lines that actually describe the failure.
const isCharmmErrorLine = (line: string): boolean =>
  line.includes('***** ERROR') ||
  line.includes('ABNORMAL TERMINATION') ||
  line.trimStart().startsWith('?')

export const summarizeCharmmErrors = (lines: string[]): string => {
  const errorLines = lines
    .filter(isCharmmErrorLine)
    .map((line) => line.trim())
    .filter(Boolean)
  return errorLines.length > 0
    ? errorLines.join(' | ')
    : 'see CHARMM log for details'
}
