import { useState } from 'react'
import {
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Typography,
  Chip,
  Alert,
  Button
} from '@mui/material'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import DownloadIcon from '@mui/icons-material/Download'
import MoviePlayer from './MoviePlayer'
import Item from 'themes/components/Item'

interface MovieAsset {
  label: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  mp4?: string
  poster?: string
  thumb?: string
  meta?: {
    width?: number
    height?: number
    stride?: number
    fps?: number
    ray?: boolean
  }
  error?: string
}

interface MovieGalleryProps {
  movies: MovieAsset[]
}

const MovieGallery = ({ movies }: MovieGalleryProps) => {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)

  const handleMovieClick = (index: number) => {
    setPlayingIndex(index === playingIndex ? null : index)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'success'
      case 'running':
        return 'warning'
      case 'failed':
        return 'error'
      case 'queued':
        return 'info'
      default:
        return 'default'
    }
  }

  const readyMovies = movies.filter(
    (movie) => movie.status === 'ready' && movie.mp4
  )
  const otherMovies = movies.filter(
    (movie) => movie.status !== 'ready' || !movie.mp4
  )

  if (movies.length === 0) {
    return <Alert severity="info">No movies available for this job.</Alert>
  }

  return (
    <Item>
      <Box>
        {/* Ready Movies Grid */}
        {readyMovies.length > 0 && (
          <>
            <Typography
              variant="h6"
              gutterBottom
            >
              Available Movies ({readyMovies.length})
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ mb: 3 }}
            >
              {readyMovies.map((movie, index) => (
                <Grid
                  size={{ xs: 12, sm: 12, md: 6, lg: 4 }}
                  key={index}
                >
                  <Card
                    sx={{
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4
                      }
                    }}
                    onClick={() => handleMovieClick(index)}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        height: 0,
                        paddingTop: '56.25%'
                      }}
                    >
                      {playingIndex === index ? (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <MoviePlayer
                            src={movie.mp4!}
                            poster={movie.poster}
                            className="w-full h-full"
                          />
                        </Box>
                      ) : (
                        <>
                          <CardMedia
                            component="img"
                            image={
                              movie.poster ||
                              movie.thumb ||
                              '/placeholder-video.png'
                            }
                            alt={movie.label}
                            sx={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              backgroundColor: '#f5f5f5'
                            }}
                          />
                          {/* Play overlay */}
                          <Box
                            sx={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              color: 'white',
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              borderRadius: '50%',
                              width: 48,
                              height: 48,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <PlayCircleOutlineIcon fontSize="large" />
                          </Box>
                        </>
                      )}
                    </Box>
                    <CardContent
                      sx={{
                        pb: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <Box>
                        <Typography
                          variant="subtitle1"
                          noWrap
                        >
                          {(() => {
                            const match = movie.label.match(/rg_(\d+)/i)
                            return match ? (
                              <>
                                Radius of Gyration constraints -{' '}
                                <b>{match[1]}</b> Å
                              </>
                            ) : (
                              movie.label
                            )
                          })()}
                        </Typography>
                        {movie.meta && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {movie.meta.width}px ×{movie.meta.height}px
                            {movie.meta.fps && ` • ${movie.meta.fps}fps`}
                          </Typography>
                        )}
                      </Box>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        sx={{ ml: 2, whiteSpace: 'nowrap' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          const link = document.createElement('a')
                          link.href = movie.mp4!
                          link.download =
                            movie.label.replace(/\s+/g, '_') + '.mp4'
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                        }}
                      >
                        Download
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* Other Movies (queued, running, failed) */}
        {otherMovies.length > 0 && (
          <>
            <Typography
              variant="h6"
              gutterBottom
            >
              Processing Movies ({otherMovies.length})
            </Typography>
            <Grid
              container
              spacing={1}
            >
              {otherMovies.map((movie, index) => (
                <Grid
                  size="auto"
                  key={index}
                >
                  <Chip
                    label={`${movie.label} - ${movie.status}`}
                    color={getStatusColor(movie.status)}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Box>

      {/* Dialog removed: now plays inline in tile */}
    </Item>
  )
}

export default MovieGallery
