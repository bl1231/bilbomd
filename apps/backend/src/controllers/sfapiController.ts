import { Request, Response } from 'express'
import axios, { AxiosResponse } from 'axios'
import { logger } from '../middleware/loggers.js'

const baseURL = 'https://api.nersc.gov/api/v1.2'

// Define interfaces for the request and response structures
interface RequestConfig {
  endpoint: string
  token?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  params?: Record<string, string | number | boolean>
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

interface StorageStats {
  name: string
  bytes_given: number
  bytes_used: number
  bytes_given_human: string
  bytes_used_human: string
  files_given: number
  files_used: number
}

interface ProjectStats {
  id: number
  description: string
  repo_name: string
  iris_role?: string
  hours_given: number
  hours_used: number
  project_hours_given: number
  project_hours_used: number
  cpu_hours_given: number
  cpu_hours_used: number
  cpu_project_hours_given: number
  cpu_project_hours_used: number
  gpu_hours_given: number
  gpu_hours_used: number
  gpu_project_hours_given: number
  gpu_project_hours_used: number
  projdir_usage: StorageStats[]
  project_projdir_usage: StorageStats
  hpss_usage?: StorageStats[] // Assuming this can be optional
}

type NerscProjectsArray = ProjectStats[]

async function makeSFApiRequest<T>({
  endpoint,
  token,
  method = 'GET',
  data = {},
  params = {}
}: RequestConfig): Promise<ApiResponse<T>> {
  try {
    if (!token) {
      throw new Error('Unauthorized: No SF API token provided.')
    }

    const config = {
      method,
      url: `${baseURL}${endpoint}`,
      headers: { Authorization: `Bearer ${token}` },
      params,
      ...(Object.keys(data).length > 0 && { data }) // Include data if it's not empty
    }

    const response: AxiosResponse<T> = await axios(config)
    return { success: true, data: response.data }
  } catch (error: unknown) {
    // TypeScript 4.4 and later requires catch clauses to use the type 'unknown'
    // Check if the error is an AxiosError
    if (axios.isAxiosError(error)) {
      console.error(`Error making SF API request to ${endpoint}:`, error)
      // Now that we've narrowed the type to AxiosError, we can safely access error.response
      return {
        success: false,
        error: error.response?.data.error || error.message
      }
    } else {
      // Handle non-Axios errors
      console.error('An unexpected error occurred:', error)
      return {
        success: false,
        error: 'An unexpected error occurred'
      }
    }
  }
}

async function makeUnauthenticatedSFApiRequest<T>({
  endpoint,
  method = 'GET',
  data = {},
  params = {}
}: RequestConfig): Promise<ApiResponse<T>> {
  try {
    const config = {
      method,
      url: `${baseURL}${endpoint}`,
      params,
      ...(Object.keys(data).length > 0 && { data }) // Include data if it's not empty
    }

    const response: AxiosResponse<T> = await axios(config)
    return { success: true, data: response.data }
  } catch (error: unknown) {
    // TypeScript 4.4 and later requires catch clauses to use the type 'unknown'
    // Check if the error is an AxiosError
    if (axios.isAxiosError(error)) {
      console.error(`Error making SF API request to ${endpoint}:`, error)
      // Now that we've narrowed the type to AxiosError, we can safely access error.response
      return {
        success: false,
        error: error.response?.data.error || error.message
      }
    } else {
      // Handle non-Axios errors
      console.error('An unexpected error occurred:', error)
      return {
        success: false,
        error: 'An unexpected error occurred'
      }
    }
  }
}

const getStatus = async (req: Request, res: Response) => {
  const { success, data, error } = await makeUnauthenticatedSFApiRequest({
    endpoint: '/status'
  })

  if (!success) {
    res.status(500).json({ error })
    return
  }

  res.json(data)
}

const getOutages = async (req: Request, res: Response) => {
  const { success, data, error } = await makeUnauthenticatedSFApiRequest({
    endpoint: '/status/outages/planned/perlmutter'
  })

  if (!success) {
    res.status(500).json({ error })
    return
  }

  res.json(data)
}

const getUser = async (req: Request, res: Response) => {
  const username = 'sclassen'
  if (!req.sfApiToken) {
    res.status(401).json({ error: 'No SF API token provided.' })
    return
  }
  const { success, data, error } = await makeSFApiRequest({
    endpoint: '/account',
    token: req.sfApiToken as string,
    params: {
      username: username
    }
  })

  if (!success) {
    res.status(500).json({ error })
    return
  }

  res.json(data)
}

const getProjectHours = async (req: Request, res: Response) => {
  const projectName = req.params.repocode
  if (!req.sfApiToken) {
    res.status(401).json({ error: 'No SF API token provided.' })
    return
  }

  try {
    const { success, data, error } = await makeSFApiRequest<NerscProjectsArray>({
      endpoint: '/account/projects',
      token: req.sfApiToken as string
    })

    if (!success) {
      res.status(500).json({ error })
      return
    }

    if (!data) {
      res.status(404).json({ error: 'No data for that project' })
      return
    }
    // logger.info(JSON.stringify(data))
    const project = data.find((p: ProjectStats) => p.repo_name === projectName)

    if (!project) {
      res.status(404).json({ error: 'Project not found.' })
      return
    }

    const response = {
      cpu_hours_given: project.cpu_hours_given,
      cpu_hours_used: project.cpu_hours_used,
      gpu_hours_given: project.gpu_hours_given,
      gpu_hours_used: project.gpu_hours_used
    }

    logger.info(`Project ${projectName} hours: ${JSON.stringify(response)}`)
    res.json(response)
  } catch (error) {
    console.error(`Error fetching project hours for ${projectName}:`, error)
    res.status(500).json({ error: 'Failed to fetch project hours.' })
  }
}

export { getStatus, getOutages, getUser, getProjectHours }
