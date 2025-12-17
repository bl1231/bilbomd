import { http, HttpResponse } from 'msw'

const mockUsers = [
  {
    _id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['User'],
    firstName: 'Test',
    lastName: 'User',
    institution: 'Test University',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    isActive: true
  }
]

const mockJob = {
  _id: 'job-123',
  id: 'job-123',
  uuid: 'uuid-123',
  title: 'Test Job',
  jobType: 'pdb',
  status: 'Completed',
  progress: 100,
  email: 'test@example.com',
  time_started: '2023-12-01T10:00:00Z',
  time_completed: '2023-12-01T11:00:00Z',
  pdb_file: 'test.pdb',
  dat_file: 'test.dat',
  const_inp_file: 'test.inp',
  user: {
    _id: 'user-123',
    username: 'testuser',
    email: 'test@example.com'
  }
}

const mockFoxsAnalysis = {
  chi_sq: 1.23,
  rg: 25.4,
  dmax: 80.5,
  excluded_points: []
}

const mockAnonJobResponse = {
  publicId: 'pub-123',
  status: 'submitted'
}

const mockPublicJobStatus = {
  publicId: 'pub-123',
  status: 'Completed',
  progress: 100
}

// Removed unused mock data definitions
const mockFileCheckResult = {
  isValid: true,
  errors: [],
  warnings: []
}

export const handlers = [
  // Auth API
  http.get('http://localhost:3003/api/v1/auth/refresh', () => {
    return new Response(
      JSON.stringify({
        success: true,
        token: 'new-test-token'
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // Users API
  http.get('http://localhost:3003/api/v1/users', () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: mockUsers
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // Jobs API
  http.get('http://localhost:3003/api/v1/jobs', () => {
    return new Response(JSON.stringify([mockJob]), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.get('http://localhost:3003/api/v1/jobs/:id', ({ params }) => {
    if (params.id === 'non-existent') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Job not found'
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
    return new Response(JSON.stringify(mockJob), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.get('http://localhost:3003/api/v1/jobs/:id/results/foxs', () => {
    return new Response(JSON.stringify(mockFoxsAnalysis), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.get('http://localhost:3003/api/v1/jobs/:id/check-files', () => {
    return new Response(JSON.stringify(mockFileCheckResult), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.get('http://localhost:3003/api/v1/jobs/:id/movies', () => {
    return new Response(
      JSON.stringify({ movies: ['movie1.mp4', 'movie2.mp4'] }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.post('http://localhost:3003/api/v1/jobs', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    if (body?.invalidData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation error'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
    return new Response(JSON.stringify({ ...mockJob, ...body }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.patch('http://localhost:3003/api/v1/jobs', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return new Response(JSON.stringify({ ...mockJob, ...body }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.delete('http://localhost:3003/api/v1/jobs/:id', () => {
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  // Public Jobs API
  http.post('http://localhost:3003/api/v1/public/jobs', () => {
    return HttpResponse.json(mockAnonJobResponse)
  }),

  http.post('http://localhost:3003/api/v1/public/jobs/sans', () => {
    return HttpResponse.json(mockAnonJobResponse)
  }),

  http.get('http://localhost:3003/api/v1/public/jobs/:id', ({ params }) => {
    if (params.id === 'nonexistent') {
      return HttpResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return HttpResponse.json(mockPublicJobStatus)
  }),

  http.get('http://localhost:3003/api/v1/public/jobs/:id/results/foxs', () => {
    return HttpResponse.json([
      {
        filename: 'structure_001.pdb',
        chi_sq: 1.23,
        rg: 25.4,
        dmax: 80.5,
        excluded_points: []
      }
    ])
  }),

  http.get(
    'http://localhost:3003/api/v1/public/jobs/:id/results/feedback',
    () => {
      return HttpResponse.json({
        publicId: 'pub-123',
        rating: 5,
        comments: 'Great results!',
        timestamp: '2023-12-01T12:00:00Z'
      })
    }
  ),

  http.get(
    'http://localhost:3003/api/v1/public/jobs/:id/results/:filename',
    ({ params }) => {
      const { filename } = params

      if (filename === 'nonexistent.pdb') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'File not found'
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      }

      if (filename === 'ensemble.json') {
        return HttpResponse.json({
          ensemblePdbFiles: ['structure_001.pdb', 'structure_002.pdb']
        })
      }

      if (filename === 'invalid.json') {
        return HttpResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }

      if (filename === 'output.txt') {
        return new Response('This is sample text file content', {
          headers: {
            'Content-Type': 'text/plain'
          }
        })
      }

      if (filename === 'binary.dat') {
        return new Response(new ArrayBuffer(8), {
          headers: {
            'Content-Type': 'application/octet-stream'
          }
        })
      }

      // Default: return as blob (ArrayBuffer)
      return new Response(new ArrayBuffer(8), {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      })
    }
  ),

  // Users API
  http.get('http://localhost:3003/api/v1/users', () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: mockUsers
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.post('http://localhost:3003/api/v1/users', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return new Response(JSON.stringify({ ...mockUsers[0], ...body }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.patch('http://localhost:3003/api/v1/users', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return new Response(JSON.stringify({ ...mockUsers[0], ...body }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  http.delete('http://localhost:3003/api/v1/users/:id', () => {
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  // Stats API
  http.get('http://localhost:3003/api/v1/stats', () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userCount: 10,
          jobCount: 100,
          totalJobsFromUsers: 90,
          jobTypes: { pdb: 50, auto: 30, sans: 20 }
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // Configs API
  http.get('http://localhost:3003/api/v1/configs', () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          maxFileSize: 100000000,
          allowedFileTypes: ['.pdb', '.crd', '.dat'],
          enabledPipelines: ['pdb', 'crd', 'auto', 'sans'],
          serverVersion: '2.1.0',
          maintenanceMode: false,
          apiRateLimit: 100,
          jobTimeout: 3600000,
          maxJobsPerUser: 10
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // Admin API
  http.get('http://localhost:3003/api/v1/admin/queues', () => {
    return new Response(
      JSON.stringify([
        {
          name: 'test-queue',
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3,
          paused: false
        }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.post(
    'http://localhost:3003/api/v1/admin/queues/:queueName/pause',
    () => {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    }
  ),

  http.post(
    'http://localhost:3003/api/v1/admin/queues/:queueName/resume',
    () => {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    }
  ),

  http.get('http://localhost:3003/api/v1/admin/queues/:queueName/jobs', () => {
    return new Response(
      JSON.stringify([
        {
          id: 'job-1',
          name: 'test-job-1',
          data: { test: 'data' },
          opts: {},
          progress: 50,
          delay: 0,
          timestamp: 1640995200000,
          attemptsMade: 1,
          failedReason: null,
          stacktrace: null,
          returnvalue: null,
          finishedOn: null,
          processedOn: null
        }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // Analytics API
  http.get('http://localhost:3003/api/v1/admin/analytics/summary', () => {
    return new Response(
      JSON.stringify({
        users: 150,
        jobs: 2500,
        multijobs: 25,
        jobsCompleted: 2200,
        jobsFailed: 300,
        usagePerPipeline: [
          { pipeline: 'pdb', count: 800 },
          { pipeline: 'crd', count: 600 },
          { pipeline: 'auto', count: 500 },
          { pipeline: 'sans', count: 400 },
          { pipeline: 'multi', count: 200 }
        ]
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.get('http://localhost:3003/api/v1/admin/analytics/jobs/by-user', () => {
    return new Response(
      JSON.stringify([
        { userId: 'user1', count: 50 },
        { userId: 'user2', count: 30 },
        { userId: 'user3', count: 25 }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.get(
    'http://localhost:3003/api/v1/admin/analytics/usage/success-rate',
    () => {
      return new Response(
        JSON.stringify([
          { pipeline: 'pdb', successRate: 0.88, total: 800 },
          { pipeline: 'auto', successRate: 0.75, total: 500 }
        ]),
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  ),

  http.get(
    'http://localhost:3003/api/v1/admin/analytics/usage/duration-stats',
    () => {
      return new Response(
        JSON.stringify([
          {
            pipeline: 'pdb',
            avgMs: 300000,
            p50Ms: 250000,
            p90Ms: 500000,
            count: 800
          }
        ]),
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  ),

  http.get(
    'http://localhost:3003/api/v1/admin/analytics/usage/access-mode-split',
    () => {
      return new Response(
        JSON.stringify([
          { pipeline: 'pdb', access_mode: 'user', count: 600 },
          { pipeline: 'pdb', access_mode: 'anonymous', count: 200 }
        ]),
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  ),

  http.get('http://localhost:3003/api/v1/admin/analytics/usage/daily', () => {
    return new Response(
      JSON.stringify([
        { day: '2023-12-01', pipeline: 'pdb', count: 15 },
        { day: '2023-12-01', pipeline: 'auto', count: 10 }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  // User Account API
  http.post('http://localhost:3003/api/v1/users/change-email', () => {
    return new Response(
      JSON.stringify({ success: true, message: 'OTP sent' }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.post('http://localhost:3003/api/v1/users/verify-otp', () => {
    return new Response(
      JSON.stringify({ success: true, message: 'Email updated' }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.post('http://localhost:3003/api/v1/users/resend-otp', () => {
    return new Response(
      JSON.stringify({ success: true, message: 'OTP resent' }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.delete(
    'http://localhost:3003/api/v1/users/delete-user-by-username/:username',
    () => {
      return new Response(
        JSON.stringify({ success: true, message: 'User deleted' }),
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  ),

  // NERSC API (using different base URL)
  http.get('http://localhost:3003/sfapi/status', () => {
    return new Response(
      JSON.stringify([
        {
          name: 'perlmutter',
          full_name: 'Perlmutter',
          description: 'HPE Cray EX Supercomputer',
          system_type: 'compute',
          notes: ['System operational'],
          status: 'active',
          updated_at: '2023-12-01T10:00:00Z'
        },
        {
          name: 'cfs',
          full_name: 'Community File System',
          description: 'Lustre-based file system',
          system_type: 'filesystem',
          notes: ['Maintenance scheduled'],
          status: 'degraded',
          updated_at: '2023-12-01T09:30:00Z'
        }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.get('http://localhost:3003/sfapi/outages', () => {
    return new Response(
      JSON.stringify([
        {
          name: 'perlmutter',
          start_at: '2023-12-15T08:00:00Z',
          end_at: '2023-12-15T12:00:00Z',
          description: 'Scheduled maintenance',
          notes: 'System will be unavailable',
          status: 'planned',
          swo: 'SWO-2023-001',
          update_at: '2023-12-01T10:00:00Z'
        }
      ]),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }),

  http.get(
    'http://localhost:3003/sfapi/account/projects/:projectCode',
    ({ params: _params }) => {
      return HttpResponse.json({
        cpu_hours_given: 10000,
        cpu_hours_used: 5500,
        gpu_hours_given: 2000,
        gpu_hours_used: 1200
      })
    }
  )
]
