import { Request, Response } from 'express'

const mockVerifyNewUser = async (req: Request, res: Response) => {
  // Mock implementation for verifyNewUser controller
  res.status(200).json({ message: 'Mock verifyNewUser called' })
}

const mockResendVerificationCode = async (req: Request, res: Response) => {
  // Mock implementation for resendVerificationCode controller
  res.status(201).json({ message: 'Mock resendVerificationCode called' })
}

export { mockVerifyNewUser, mockResendVerificationCode }
