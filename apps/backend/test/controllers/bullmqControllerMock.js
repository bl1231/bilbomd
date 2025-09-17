"use strict";
// bullmqControllerMock.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockGetWorkers = exports.mockGetWaitingCount = exports.mockGetActiveCount = exports.getQueueStatus = void 0;
const mockGetActiveCount = jest.fn().mockResolvedValue(42); // Example value
exports.mockGetActiveCount = mockGetActiveCount;
const mockGetWaitingCount = jest.fn().mockResolvedValue(13); // Example value
exports.mockGetWaitingCount = mockGetWaitingCount;
const mockGetWorkers = jest.fn().mockResolvedValue([]); // Example value
exports.mockGetWorkers = mockGetWorkers;
const getQueueStatus = async () => {
    const bullmqActiveCount = await mockGetActiveCount();
    const bullmqWaitCount = await mockGetWaitingCount();
    const bullmqWorkerCount = (await mockGetWorkers()).length;
    const queueStatus = {
        name: 'bilbomd',
        active_count: bullmqActiveCount,
        waiting_count: bullmqWaitCount,
        worker_count: bullmqWorkerCount
    };
    return queueStatus;
};
exports.getQueueStatus = getQueueStatus;
