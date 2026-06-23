import { array, boolean, object, string } from 'yup'

export const userRegisterSchema = object().shape({
  email: string().email('Please enter a valid email').required('Required'),
  user: string()
    .min(4, 'Username must be at least 4 characters')
    .max(15, 'Username must be less than 15 characters')
    .required('Required')
})

export const userSignInSchema = object().shape({
  email: string().email('Please enter a valid email').required('Required')
})

export const editUserSchema = object().shape({
  email: string().email('Please enter a valid email').required('Required'),
  roles: array()
    .of(string())
    .min(1, 'At least one role is required')
    .required('At least one role is required'),
  active: boolean().required('Required')
})
