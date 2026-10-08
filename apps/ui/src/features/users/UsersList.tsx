import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import {
  DataGrid,
  GridActionsCellItem,
  type GridColDef,
  type GridFilterModel,
  type GridRenderCellParams
} from '@mui/x-data-grid'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import type { UserDTO } from '@bilbomd/bilbomd-types'
import { useGetUsersQuery, selectAllUsers } from 'slices/usersApiSlice'
import useTitle from 'hooks/useTitle'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import BoxDataGridWrapper from 'themes/components/BoxDataGridWrapper'
import { userDisplayName } from 'utils/userDisplayName'
import {
  formatDateSafe,
  formatRelativeDateSafe,
  parseDateSafe
} from 'utils/dates'
import {
  filterUsers,
  quickFilterWords,
  userStatusColor,
  userStatusLabel
} from './usersListHelpers'

const columns: GridColDef<UserDTO>[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1.2,
    minWidth: 140,
    valueGetter: (_value, row) => userDisplayName(row)
  },
  {
    field: 'username',
    headerName: 'Username',
    flex: 1.4,
    minWidth: 180
  },
  {
    field: 'email',
    headerName: 'Email',
    flex: 1.6,
    minWidth: 200
  },
  {
    field: 'roles',
    headerName: 'Roles',
    flex: 1,
    minWidth: 150,
    sortable: false,
    // A joined string so the quick filter and sorting see the role names.
    valueGetter: (_value, row) => row.roles.join(', '),
    renderCell: (params: GridRenderCellParams<UserDTO>) => (
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ alignItems: 'center', height: '100%' }}
      >
        {params.row.roles.map((role) => (
          <Chip
            key={role}
            label={role}
            size="small"
            color={role === 'Admin' ? 'primary' : 'default'}
            variant={role === 'User' ? 'outlined' : 'filled'}
          />
        ))}
      </Stack>
    )
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 110,
    valueGetter: (_value, row) => userStatusLabel(row),
    renderCell: (params: GridRenderCellParams<UserDTO>) => {
      const label = userStatusLabel(params.row)
      return (
        <Chip
          label={label}
          size="small"
          color={userStatusColor(label)}
          variant={label === 'Inactive' ? 'outlined' : 'filled'}
        />
      )
    }
  },
  {
    field: 'jobCount',
    headerName: 'Jobs',
    type: 'number',
    width: 80,
    valueGetter: (value: number | undefined) => value ?? 0
  },
  {
    field: 'lastAccess',
    headerName: 'Last seen',
    type: 'dateTime',
    width: 140,
    valueGetter: (value: string | null | undefined) => parseDateSafe(value),
    renderCell: (params: GridRenderCellParams<UserDTO, Date | null>) =>
      params.value ? (
        <span title={formatDateSafe(params.value)}>
          {formatRelativeDateSafe(params.value)}
        </span>
      ) : (
        <Typography
          component="span"
          variant="body2"
          color="text.disabled"
        >
          never
        </Typography>
      )
  },
  {
    field: 'createdAt',
    headerName: 'Created',
    type: 'dateTime',
    width: 120,
    valueGetter: (value: string) => parseDateSafe(value),
    valueFormatter: (value: Date | null) => formatDateSafe(value, 'yyyy-MM-dd')
  }
]

const UsersList = () => {
  useTitle('BilboMD: Users List')
  const navigate = useNavigate()
  const { isLoading, isSuccess, isError } = useGetUsersQuery('usersList', {
    pollingInterval: 60000,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true
  })
  const users = useSelector(selectAllUsers)

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const rows = useMemo(
    () => filterUsers(users, { showInactive }),
    [users, showInactive]
  )
  const inactiveCount = users.length - users.filter((u) => u.active).length

  const filterModel: GridFilterModel = useMemo(
    () => ({ items: [], quickFilterValues: quickFilterWords(search) }),
    [search]
  )

  const actionColumns = useMemo<GridColDef<UserDTO>[]>(
    () => [
      ...columns,
      {
        field: 'actions',
        headerName: '',
        type: 'actions',
        width: 60,
        getActions: (params) => [
          <GridActionsCellItem
            key={params.id}
            icon={<EditIcon />}
            label="Edit user"
            onClick={() => void navigate(String(params.id))}
          />
        ]
      }
    ],
    [navigate]
  )

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  } else if (isError) {
    body = (
      <Alert
        severity="error"
        variant="outlined"
      >
        An error occurred while fetching users.
      </Alert>
    )
  } else if (isSuccess && users.length === 0) {
    body = (
      <Typography
        color="text.secondary"
        sx={{ p: 2 }}
      >
        No users found.
      </Typography>
    )
  } else {
    body = (
      <DataGrid
        rows={rows}
        columns={actionColumns}
        rowHeight={40}
        filterModel={filterModel}
        onRowClick={(params) => void navigate(String(params.id))}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'lastAccess', sort: 'desc' }] }
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        sx={{
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
            outline: 'none'
          }
        }}
      />
    )
  }

  return (
    <BoxDataGridWrapper>
      <HeaderBox>
        <Typography>Users</Typography>
      </HeaderBox>
      <Item>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, mb: 1.5 }}
        >
          <TextField
            size="small"
            placeholder="Search name, username, email, or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!isSuccess}
            sx={{ flexGrow: 1, maxWidth: 480 }}
            slotProps={{
              input: {
                'aria-label': 'Search users',
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
            }
            label={`Show inactive (${inactiveCount})`}
          />
          <Box sx={{ flexGrow: 1 }} />
          {isSuccess && (
            <Typography
              variant="body2"
              color="text.secondary"
            >
              {rows.length} of {users.length} users
            </Typography>
          )}
        </Stack>
        {body}
      </Item>
    </BoxDataGridWrapper>
  )
}

export default UsersList
