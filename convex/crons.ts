import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
    "deliver queued messages",
    { minutes: 5 },
    api.messages.deliverQueued,
    { limit: 25 }
);

export default crons;
