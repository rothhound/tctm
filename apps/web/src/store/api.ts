import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from './store';
import { logout } from './authSlice';
import type { TaskDto, TaskNoteDto, TaskCounts, LoginResponse, PaginatedResponse } from '@tctm/shared';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 401) {
    api.dispatch(logout());
    window.location.replace('/login');
  }
  return result;
};

export const api = createApi({
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Tasks', 'TaskCounts', 'TaskNotes', 'AuditLog', 'SourceConfig', 'Entities', 'Metrics', 'Prompts'],
  endpoints: (builder) => ({
    // Auth
    login: builder.mutation<LoginResponse, { password: string }>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
    }),

    // Tasks — paginated by bucket
    getTasks: builder.query<PaginatedResponse<TaskDto>, { bucket?: string; page?: number; limit?: number }>({
      query: ({ bucket, page = 1, limit = 25 }) => ({
        url: 'tasks',
        params: { ...(bucket ? { bucket } : {}), page, limit },
      }),
      providesTags: ['Tasks'],
    }),

    getTaskCounts: builder.query<TaskCounts, void>({
      query: () => 'tasks/counts',
      providesTags: ['TaskCounts'],
    }),

    getTask: builder.query<TaskDto, string>({
      query: (id) => `tasks/${id}`,
      providesTags: ['Tasks'],
    }),

    acceptTask: builder.mutation<void, { id: string; bucket: string }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}/accept`, method: 'POST', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    dismissTask: builder.mutation<void, { id: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}/dismiss`, method: 'POST', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    updateTask: builder.mutation<void, { id: string; [key: string]: any }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    completeTask: builder.mutation<void, string>({
      query: (id) => ({ url: `tasks/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
    }),

    snoozeTask: builder.mutation<void, { id: string; until: string }>({
      query: ({ id, ...body }) => ({ url: `tasks/${id}/snooze`, method: 'POST', body }),
      invalidatesTags: ['Tasks', 'TaskCounts'],
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
  useLoginMutation,
  useGetTasksQuery,
  useGetTaskQuery,
  useUpdateTaskMutation,
  useCompleteTaskMutation,
  useSetReminderMutation,
  useClearReminderMutation,
  useGetSubtasksQuery,
  useCreateSubtaskMutation,
  useGetArchivedTasksQuery,
  useArchiveTaskMutation,
  useUnarchiveTaskMutation,
  useGetReportedTasksQuery,
  useGetSnoozedTasksQuery,
  useReportTaskMutation,
  useUnreportTaskMutation,
  useGetTaskNotesQuery,
  useCreateTaskNoteMutation,
  useDeleteTaskNoteMutation,
  useGetAuditLogQuery,
  useSubscribePushMutation,
  useGetSourceConfigsQuery,
  useUpdateSourceConfigMutation,
  useGetEntitiesQuery,
  useCreateEntityMutation,
  useDeleteEntityMutation,
  useGetMetricsQuery,
  useGetPromptVersionsQuery,
  useActivatePromptVersionMutation,
} = api;
