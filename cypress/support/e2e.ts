declare global {
  namespace Cypress {
    interface Chainable {
      login(): Chainable<void>;
      interceptApi(overrides?: Record<string, any>): Chainable<void>;
    }
  }
}

// Inject JWT into localStorage to bypass login
Cypress.Commands.add('login', () => {
  localStorage.setItem('token', 'test-jwt-token-for-cypress');
  localStorage.setItem('expiresAt', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
});

// Set up default API intercepts — all return empty/safe defaults.
// Individual specs override specific routes as needed.
Cypress.Commands.add('interceptApi', (overrides = {}) => {
  // Paginated task list — default empty
  cy.intercept('GET', '/api/tasks?*', {
    body: { data: [], total: 0, page: 1, limit: 25, hasMore: false },
  }).as('getTasks');

  // Counts
  cy.intercept('GET', '/api/tasks/counts', {
    body: { pending: 0, done: 0, total: 0, filtered: 0 },
  }).as('getCounts');

  // Per-bucket "new since last looked" counts — drives the nav badges, fired on EVERY page.
  // If unstubbed, this hits the real API with the test JWT → 401 → global logout → redirect to /login.
  cy.intercept('GET', '/api/tasks/new-counts*', {
    body: { active: 0, snoozed: 0, filtered: 0 },
  }).as('getNewCounts');

  // Filtered (agent-dismissed) list + connector health (also otherwise unstubbed → 401)
  cy.intercept('GET', '/api/tasks/filtered', { body: [] }).as('getFiltered');
  cy.intercept('GET', '/api/health/integrations', { body: [] }).as('getIntegrations');

  // Web-push subscribe/unsubscribe (Settings → Notifications)
  cy.intercept('POST', '/api/push/subscribe', { statusCode: 200, body: { subscribed: true } }).as('subscribePush');
  cy.intercept('DELETE', '/api/push/unsubscribe', { statusCode: 204 }).as('unsubscribePush');

  // Single task
  cy.intercept('GET', '/api/tasks/task-*', { body: {} }).as('getTask');

  // Subtasks + notes
  cy.intercept('GET', '/api/tasks/*/subtasks', { body: [] }).as('getSubtasks');
  cy.intercept('GET', '/api/tasks/*/notes', { body: [] }).as('getNotes');

  // List endpoints
  cy.intercept('GET', '/api/tasks/archived', { body: [] }).as('getArchived');
  cy.intercept('GET', '/api/tasks/reported', { body: [] }).as('getReported');
  cy.intercept('GET', '/api/tasks/snoozed', { body: [] }).as('getSnoozed');

  // Mutations — all succeed
  cy.intercept('POST', '/api/tasks/*/complete', { statusCode: 200, body: {} }).as('completeTask');
  cy.intercept('POST', '/api/tasks/*/archive', { statusCode: 200, body: {} }).as('archiveTask');
  cy.intercept('POST', '/api/tasks/*/unarchive', { statusCode: 200, body: {} }).as('unarchiveTask');
  cy.intercept('POST', '/api/tasks/*/report', { statusCode: 200, body: {} }).as('reportTask');
  cy.intercept('POST', '/api/tasks/*/unreport', { statusCode: 200, body: {} }).as('unreportTask');
  cy.intercept('POST', '/api/tasks/*/remind', { statusCode: 200, body: {} }).as('setReminder');
  cy.intercept('DELETE', '/api/tasks/*/remind', { statusCode: 204 }).as('clearReminder');
  cy.intercept('PATCH', '/api/tasks/*', { statusCode: 200, body: {} }).as('updateTask');
  cy.intercept('POST', '/api/tasks/*/notes', { statusCode: 200, body: { id: 'note-new', taskId: 'task-001', content: '', createdAt: new Date().toISOString() } }).as('createNote');
  cy.intercept('DELETE', '/api/tasks/notes/*', { statusCode: 204 }).as('deleteNote');

  // Settings endpoints
  cy.intercept('GET', '/api/source-config', { body: [] }).as('getSourceConfig');
  cy.intercept('GET', '/api/entities', { body: [] }).as('getEntities');
  cy.intercept('GET', '/api/audit*', { body: [] }).as('getAudit');
  cy.intercept('GET', '/api/metrics/daily*', {
    body: { period: { days: 30, since: new Date().toISOString() }, signalsBySource: {}, tasksByStatus: {}, autoCreateRatio: 0, totalLlmCostUsd: 0 },
  }).as('getMetrics');
  cy.intercept('GET', '/api/prompts?*', { body: [] }).as('getPrompts');
  cy.intercept('GET', '/api/prompts/active/*', { body: null }).as('getActivePrompt');

  cy.intercept('GET', '/api/health', { body: { db: 'ok', redis: 'ok' } });
});

export {};
