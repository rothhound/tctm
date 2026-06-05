import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from './store';
import { logout, setCredentials } from './authSlice';
import type { TaskDto, TaskNoteDto, TaskCounts, LoginResponse, PaginatedResponse } from '@tctm/shared';

export type IntegrationStatus = {
  name: string;
  state: 'ok' | 'configured' | 'inactive' | 'not_configured' | 'error';
  detail: string;
  signalsToday: number;
  signalsAllTime: number;
  paused: boolean;
  tracks: { label: string; example: string }[];
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

/**
 * Reads sliding-refresh headers from a Response. Returns new credentials when
 * the backend issued a refreshed token, or null otherwise. Exported for tests.
 */
export function extractRefreshedCredentials(
  headers: Headers | undefined,
): { token: string; expiresAt: string } | null {
  if (!headers) return null;
  const token = headers.get('x-refresh-token');
  const expiresAt = headers.get('x-refresh-expires');
  if (!token || !expiresAt) return null;
  return { token, expiresAt };
}

/**
 * Endpoints whose 401 means "this login attempt failed" rather than "your
 * session expired". For these, we let the error bubble back to the caller and
 * do NOT dispatch logout or redirect.
 */
const LOGIN_ENDPOINTS = new Set(['loginWithGoogle']);

/**
 * True when a baseQuery result represents a session-expired condition that
 * should clear credentials and force a re-login. Exported for tests.
 */
export function shouldClearSession(
  status: number | string | undefined,
  endpoint: string,
): boolean {
  if (status !== 401) return false;
  if (LOGIN_ENDPOINTS.has(endpoint)) return false;
  return true;
}

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  // Sliding refresh: backend sets these headers when the token is approaching expiry.
  const refreshed = extractRefreshedCredentials(result.meta?.response?.headers);
  if (refreshed) {
    api.dispatch(setCredentials(refreshed));
  }

  // Session-expired handling: dispatch logout so RequireAuth (router-level)
  // redirects to /login with from= preserved. Skip the login endpoints — their
  // 401 is the expected "wrong email" outcome of trying to log in. No
  // window.location.replace: full reload would lose SPA state and the deep-link
  // capture in RequireAuth.
  if (shouldClearSession(result.error?.status, api.endpoint)) {
    api.dispatch(logout());
  }
  return result;
};

export const api = createApi({
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Tasks', 'TaskCounts', 'TaskNotes', 'AuditLog', 'SourceConfig', 'Entities', 'Metrics', 'Prompts'],
  // Inbox feel: revalidate when the tab regains focus or the network reconnects (paired with
  // setupListeners in store.ts). The Active list also polls on an interval (see useAllTasks).
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (builder) => ({
    // Auth — Google ID token exchange
    loginWithGoogle: builder.mutation<LoginResponse, { idToken: string }>({
      query: (body) => ({ url: 'auth/google', method: 'POST', body }),
    }),

    // Tasks — the Active queue (keep + review, not agent-dismissed), paginated
    getTasks: builder.query<PaginatedResponse<TaskDto>, { page?: number; limit?: number }>({
      query: ({ page = 1, limit = 25 } = {}) => ({
        url: 'tasks',
        params: { page, limit },
      }),
      providesTags: ['Tasks'],
    }),

    getTaskCounts: builder.query<TaskCounts, void>({
      query: () => 'tasks/counts',
      providesTags: ['TaskCounts'],
    }),

    // Per-bucket "new since last looked" counts for the nav badges. Args are the client's
    // per-bucket watermarks; a missing one yields 0 for that bucket.
    getNewCounts: builder.query<
      { active: number; snoozed: number; filtered: number },
      { activeSince?: string; snoozedSince?: string; filteredSince?: string }
    >({
      query: (params) => ({ url: 'tasks/new-counts', params }),
      providesTags: ['TaskCounts'],
    }),

    getIntegrationHealth: builder.query<IntegrationStatus[], void>({
      query: () => 'health/integrations',
      providesTags: ['SourceConfig'], // so pausing a connector (updateSourceConfig) refetches this
    }),

    getTask: builder.query<TaskDto, string>({
      query: (id) => `tasks/${id}`,
      providesTags: ['Tasks'],
    }),

    updateTask: builder.mutation<void, { id: string; [key: string]: any }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    completeTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    uncompleteTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/uncomplete`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    getDoneTasks: builder.query<TaskDto[], void>({
      query: () => 'tasks/done',
      providesTags: ['Tasks'],
    }),

    // Remind me
    setReminder: builder.mutation<void, { id: string; reminderAt: string }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}/remind`, method: 'POST', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),
    clearReminder: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/remind`, method: 'DELETE' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    // Audit
    getAuditLog: builder.query<any[], { signalId?: string; purpose?: string; since?: string; until?: string; limit?: number }>({
      query: (params) => ({ url: 'audit', params }),
      providesTags: ['AuditLog'],
    }),

    // Reported (bad extractions)
    getReportedTasks: builder.query<TaskDto[], void>({
      query: () => 'tasks/reported',
      providesTags: ['Tasks'],
    }),
    getSnoozedTasks: builder.query<TaskDto[], void>({
      query: () => 'tasks/snoozed',
      providesTags: ['Tasks'],
    }),

    reportTask: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `tasks/${id}/report`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),
    unreportTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/unreport`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    // Push subscriptions
    subscribePush: builder.mutation<{ subscribed: boolean }, { endpoint: string; keys: { p256dh: string; auth: string } }>({
      query: (body) => ({ url: 'push/subscribe', method: 'POST', body }),
    }),

    unsubscribePush: builder.mutation<void, { endpoint: string }>({
      query: (body) => ({ url: 'push/unsubscribe', method: 'DELETE', body }),
    }),

    // Source config
    getSourceConfigs: builder.query<any[], void>({
      query: () => 'source-config',
      providesTags: ['SourceConfig'],
    }),
    updateSourceConfig: builder.mutation<any, { source: string; thresholds?: any; enabled?: boolean }>({
      query: ({ source, ...body }) => ({ url: `source-config/${source}`, method: 'PATCH', body }),
      invalidatesTags: ['SourceConfig'],
    }),

    // Entities
    getEntities: builder.query<any[], void>({
      query: () => 'entities',
      providesTags: ['Entities'],
    }),
    createEntity: builder.mutation<any, any>({
      query: (body) => ({ url: 'entities', method: 'POST', body }),
      invalidatesTags: ['Entities'],
    }),
    updateEntity: builder.mutation<any, { id: string; [key: string]: any }>({
      query: ({ id, ...body }) => ({ url: `entities/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Entities'],
    }),
    deleteEntity: builder.mutation<void, string>({
      query: (id) => ({ url: `entities/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Entities'],
    }),

    // Metrics
    getMetrics: builder.query<any, { days?: number }>({
      query: (params) => ({ url: 'metrics/daily', params }),
      providesTags: ['Metrics'],
    }),

    // Subtasks
    getSubtasks: builder.query<TaskDto[], string>({
      query: (parentId) => `tasks/${parentId}/subtasks`,
      providesTags: ['Tasks'],
    }),
    createSubtask: builder.mutation<{ id: string }, { parentId: string; title: string; description?: string; priority?: string; dueAt?: string }>({
      query: ({ parentId, ...body }) => ({ url: `tasks/${parentId}/subtasks`, method: 'POST', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    // Task Notes
    getTaskNotes: builder.query<TaskNoteDto[], string>({
      query: (taskId) => `tasks/${taskId}/notes`,
      providesTags: (_result, _err, taskId) => [{ type: 'TaskNotes', id: taskId }],
    }),
    createTaskNote: builder.mutation<TaskNoteDto, { taskId: string; content: string }>({
      query: ({ taskId, content }) => ({ url: `tasks/${taskId}/notes`, method: 'POST', body: { content } }),
      invalidatesTags: (_result, _err, { taskId }) => [{ type: 'TaskNotes', id: taskId }],
    }),
    deleteTaskNote: builder.mutation<void, { taskId: string; noteId: string }>({
      query: ({ noteId }) => ({ url: `tasks/notes/${noteId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _err, { taskId }) => [{ type: 'TaskNotes', id: taskId }],
    }),

    // Archive
    getArchivedTasks: builder.query<TaskDto[], void>({
      query: () => 'tasks/archived',
      providesTags: ['Tasks'],
    }),
    archiveTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/archive`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),
    unarchiveTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/unarchive`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    // Filtered (agent-dismissed)
    getFilteredTasks: builder.query<TaskDto[], void>({
      query: () => 'tasks/filtered',
      providesTags: ['Tasks'],
    }),
    restoreTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    // Prompts
    getPromptVersions: builder.query<any[], string>({
      query: (purpose) => ({ url: 'prompts', params: { purpose } }),
      providesTags: ['Prompts'],
    }),
    getActivePrompt: builder.query<any, string>({
      query: (purpose) => `prompts/active/${purpose}`,
      providesTags: ['Prompts'],
    }),
    createPromptVersion: builder.mutation<any, { purpose: string; content: string; metadata?: any }>({
      query: (body) => ({ url: 'prompts', method: 'POST', body }),
      invalidatesTags: ['Prompts'],
    }),
    activatePromptVersion: builder.mutation<any, string>({
      query: (id) => ({ url: `prompts/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Prompts'],
    }),

    // Snooze parse
    parseSnoze: builder.mutation<{ date: string | null; confidence: number; interpretation: string }, { text: string }>({
      query: (body) => ({ url: 'snooze/parse', method: 'POST', body }),
    }),
  }),
});

export const {
  useLoginWithGoogleMutation,
  useGetTasksQuery,
  useGetTaskQuery,
  useUpdateTaskMutation,
  useCompleteTaskMutation,
  useUncompleteTaskMutation,
  useGetDoneTasksQuery,
  useSetReminderMutation,
  useClearReminderMutation,
  useGetSubtasksQuery,
  useCreateSubtaskMutation,
  useGetArchivedTasksQuery,
  useArchiveTaskMutation,
  useUnarchiveTaskMutation,
  useGetFilteredTasksQuery,
  useRestoreTaskMutation,
  useGetTaskCountsQuery,
  useGetNewCountsQuery,
  useGetIntegrationHealthQuery,
  useGetReportedTasksQuery,
  useGetSnoozedTasksQuery,
  useReportTaskMutation,
  useUnreportTaskMutation,
  useGetTaskNotesQuery,
  useCreateTaskNoteMutation,
  useDeleteTaskNoteMutation,
  useGetAuditLogQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  useGetSourceConfigsQuery,
  useUpdateSourceConfigMutation,
  useGetEntitiesQuery,
  useCreateEntityMutation,
  useDeleteEntityMutation,
  useGetMetricsQuery,
  useGetPromptVersionsQuery,
  useActivatePromptVersionMutation,
} = api;
