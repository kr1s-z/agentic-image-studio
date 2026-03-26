import type { Job } from "./types";

const jobs = new Map<string, Job>();

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function setJob(job: Job): void {
  jobs.set(job.id, job);
}

export function hasJob(id: string): boolean {
  return jobs.has(id);
}
