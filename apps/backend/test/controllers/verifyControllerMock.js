"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockResendVerificationCode = exports.mockVerifyNewUser = void 0;
const mockVerifyNewUser = async (req, res) => {
    // Mock implementation for verifyNewUser controller
    res.status(200).json({ message: 'Mock verifyNewUser called' });
};
exports.mockVerifyNewUser = mockVerifyNewUser;
const mockResendVerificationCode = async (req, res) => {
    // Mock implementation for resendVerificationCode controller
    res.status(201).json({ message: 'Mock resendVerificationCode called' });
};
exports.mockResendVerificationCode = mockResendVerificationCode;
