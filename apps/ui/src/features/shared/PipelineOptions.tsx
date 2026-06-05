import React from 'react'
import {
  Box,
  List,
  Paper,
  Avatar,
  ListItem,
  ListItemAvatar,
  ListItemText
} from '@mui/material'
import { green } from '@mui/material/colors'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'

interface PipelineType {
  title: string
  description: string
  schematic: React.ReactNode
}

interface PipelineOptionsProps {
  pipelines: PipelineType[]
  isLightMode?: boolean
}

const PipelineOptions = ({ pipelines }: PipelineOptionsProps) => (
  <List>
    {pipelines.map((pipeline, index) => (
      <Paper
        key={index}
        className='bilbomd-pipeline'
        sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
      >
        <ListItem
          sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2
          }}
        >
          <ListItemAvatar>
            <Avatar sx={{ backgroundColor: green[700] }}>
              <RocketLaunchIcon />
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={pipeline.title}
            secondary={pipeline.description}
            sx={{ flex: '1 1 auto', minWidth: '200px' }}
          />
          <Box sx={{ maxWidth: '65%', width: '100%' }}>
            {pipeline.schematic}
          </Box>
        </ListItem>
      </Paper>
    ))}
  </List>
)

export default PipelineOptions
