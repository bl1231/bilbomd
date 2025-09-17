"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const verifyControllerMock_1 = require("../controllers/verifyControllerMock");
router.route('/').post(verifyControllerMock_1.mockVerifyNewUser);
router.route('/resend').post(verifyControllerMock_1.mockResendVerificationCode);
module.exports = router;
