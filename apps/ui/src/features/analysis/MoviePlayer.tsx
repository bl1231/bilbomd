// MoviePlayer.tsx
import { useRef } from 'react'

type Props = {
  src: string
  poster?: string
  className?: string
}

const MoviePlayer = ({ src, poster, className }: Props) => {
  const ref = useRef<HTMLVideoElement | null>(null)

  return (
    <div
      className={`relative w-full h-full ${className ?? ''}`}
      style={{ background: '#111' }}
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        autoPlay
        loop
        controlsList="nodownload noplaybackrate"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#111',
          display: 'block',
          zIndex: 2
        }}
        // ...existing code...
      />
    </div>
  )
}

export default MoviePlayer
