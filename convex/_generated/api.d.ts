/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_actions from "../ai/actions.js";
import type * as ai_tools from "../ai/tools.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as events_mutations from "../events/mutations.js";
import type * as events_queries from "../events/queries.js";
import type * as feeds_mutations from "../feeds/mutations.js";
import type * as feeds_queries from "../feeds/queries.js";
import type * as friends_mutations from "../friends/mutations.js";
import type * as friends_queries from "../friends/queries.js";
import type * as http from "../http.js";
import type * as ical_actions from "../ical/actions.js";
import type * as ical_parser from "../ical/parser.js";
import type * as meetings_mutations from "../meetings/mutations.js";
import type * as meetings_queries from "../meetings/queries.js";
import type * as subscriptions_mutations from "../subscriptions/mutations.js";
import type * as subscriptions_queries from "../subscriptions/queries.js";
import type * as subscriptions_sync from "../subscriptions/sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/actions": typeof ai_actions;
  "ai/tools": typeof ai_tools;
  auth: typeof auth;
  crons: typeof crons;
  "events/mutations": typeof events_mutations;
  "events/queries": typeof events_queries;
  "feeds/mutations": typeof feeds_mutations;
  "feeds/queries": typeof feeds_queries;
  "friends/mutations": typeof friends_mutations;
  "friends/queries": typeof friends_queries;
  http: typeof http;
  "ical/actions": typeof ical_actions;
  "ical/parser": typeof ical_parser;
  "meetings/mutations": typeof meetings_mutations;
  "meetings/queries": typeof meetings_queries;
  "subscriptions/mutations": typeof subscriptions_mutations;
  "subscriptions/queries": typeof subscriptions_queries;
  "subscriptions/sync": typeof subscriptions_sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
