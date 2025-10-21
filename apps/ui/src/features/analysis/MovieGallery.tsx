import { useState } from 'react'
import {
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Typography,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Chip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import MoviePlayer from './MoviePlayer'

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
  const [selectedMovie, setSelectedMovie] = useState<MovieAsset | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleMovieClick = (movie: MovieAsset) => {
    if (movie.status === 'ready' && movie.mp4) {
      setSelectedMovie(movie)
      setDialogOpen(true)
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setSelectedMovie(null)
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
    return (
      <Typography color="text.secondary">
        No movies available for this job.
      </Typography>
    )
  }

  return (
    <>
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
                  size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
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
                    onClick={() => handleMovieClick(movie)}
                  >
                    <Box sx={{ position: 'relative' }}>
                      <CardMedia
                        component="img"
                        height="140"
                        image={
                          movie.poster ||
                          movie.thumb ||
                          '/placeholder-video.png'
                        }
                        alt={movie.label}
                        sx={{
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
                          padding: 1
                        }}
                      >
                        <PlayCircleOutlineIcon fontSize="large" />
                      </Box>
                    </Box>
                    <CardContent sx={{ pb: 2 }}>
                      <Typography
                        variant="subtitle2"
                        noWrap
                      >
                        {movie.label}
                      </Typography>
                      {movie.meta && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {movie.meta.width}×{movie.meta.height}
                          {movie.meta.fps && ` • ${movie.meta.fps}fps`}
                        </Typography>
                      )}
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

      {/* Movie Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { backgroundColor: '#000' }
        }}
      >
        <DialogTitle sx={{ color: 'white', pb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography variant="h6">{selectedMovie?.label}</Typography>
            <IconButton
              onClick={handleCloseDialog}
              sx={{ color: 'white' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {selectedMovie?.mp4 && (
            <MoviePlayer
              src={selectedMovie.mp4}
              poster={selectedMovie.poster}
              className="w-full"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default MovieGallery
