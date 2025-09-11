"use strict";
// bullmqMock.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bullmqControllerMock_1 = require("../controllers/bullmqControllerMock"); // Import the controller mock
const router = express_1.default.Router();
// Mock the route handler
router.get('/', async (req, res) => {
    try {
        const queueStatus = await (0, bullmqControllerMock_1.getQueueStatus)();
        res.status(200).json(queueStatus);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});
module.exports = router;
