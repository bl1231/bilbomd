// index.ts
import { serve } from 'bun'

const PORT = 3005

serve({
  port: PORT,
  fetch: async (req: Request) => {
    // Log the request URL
    console.log('URL:', req.url)
    const result = await spawnTest()
    return new Response(result)
  }
})

const spawnTest = async () => {
  const proc = Bun.spawn(['python', 'scripts/test.py'])
  const text = await new Response(proc.stdout).text()
  console.log(text)
  return text
}
