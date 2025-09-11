"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockGetWaitingJobs = exports.mockBilbomdQueue = exports.mockQueueJob = void 0;
const bullmq_1 = require("bullmq");
const mockQueue = [];
const mockBilbomdQueue = new bullmq_1.Queue('bilbomd');
exports.mockBilbomdQueue = mockBilbomdQueue;
const mockQueueJob = async (data) => {
    try {
        console.log(`${data.type} Job "${data.title}" about to be added to queue`);
        const mockJob = {
            id: `${Date.now()}`,
            name: data.title,
            data,
            opts: {
                attempts: 3
            },
            timestamp: Date.now(),
            finishedOn: null,
            processedOn: null,
            progress: 0,
            attemptsMade: 0,
            stacktrace: null,
            returnvalue: null,
            state: 'waiting',
            optsJob: {}
        };
        mockQueue.push(mockJob);
        return mockJob.id;
    }
    catch (error) {
        console.error('Error adding job to queue:', error);
        throw error;
    }
};
exports.mockQueueJob = mockQueueJob;
const mockGetWaitingJobs = async () => {
    // For simplicity, the mock implementation returns all jobs
    return mockQueue;
};
exports.mockGetWaitingJobs = mockGetWaitingJobs;
