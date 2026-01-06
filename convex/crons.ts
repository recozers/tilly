import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync calendar subscriptions every 5 minutes
crons.interval(
  "sync-calendar-subscriptions",
  { minutes: 5 },
  internal.subscriptions.sync.runBackgroundSync
);

export default crons;
