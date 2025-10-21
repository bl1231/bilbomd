// MoviePlayer.tsx
import { useRef, useState, useEffect } from 'react'

type Props = {
  src: string
  poster?: string
  className?: string
}

const MoviePlayer = ({ src, poster, className }: Props) => {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReady(false)
    setError(null)
  }, [src])

  return (
    <div className={`relative w-full ${className ?? ''}`}>
      {/* 16:9 responsive box; swap to aspect-[4/3] if you prefer */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls
          preload="metadata"
          playsInline
          // You can hide download in most chromium browsers; it’s not a guarantee:
          controlsList="nodownload noplaybackrate"
          className="h-full w-full object-contain"
          onLoadedMetadata={() => setReady(true)}
          onError={() => setError('Failed to load video')}
        />
      </div>

      {/* lightweight status row */}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{ready ? 'Ready' : error ? error : 'Loading…'}</span>
        {/* Example manual API usage: */}
        {/* <button onClick={() => ref.current?.requestFullscreen()} className="underline">Fullscreen</button> */}
      </div>
    </div>
  )
}

export default MoviePlayer
