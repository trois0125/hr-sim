// ワーカー：受け取った会社を順に回して結果を返す
import { parentPort, workerData } from 'node:worker_threads';
import { runJob, type Job } from './batch';

const jobs = workerData as Job[];
for (const job of jobs) parentPort?.postMessage({ type: 'result', result: runJob(job) });
parentPort?.postMessage({ type: 'done' });
