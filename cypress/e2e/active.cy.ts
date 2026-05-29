describe('Active Page', () => {
  function setupTaskIntercepts() {
    cy.fixture('tasks').then((tasks) => {
      const pending = tasks.filter(
        (t: any) => t.status === 'pending' && !t.archived && !t.reported && !t.reminderAt,
      );
      const done = tasks.filter(
        (t: any) => t.status === 'done' && !t.archived && !t.reported,
      );
      const allActive = [...pending, ...done];

      // The useAllTasks hook fetches each bucket separately
      for (const bucket of ['inbox', 'review', 'today', 'this_week', 'waiting_on']) {
        const bucketTasks = allActive.filter((t: any) => t.bucket === bucket);
        cy.intercept('GET', `/api/tasks?bucket=${bucket}*`, {
          body: { data: bucketTasks, total: bucketTasks.length, page: 1, limit: 25, hasMore: false },
        });
      }

      cy.intercept('GET', '/api/tasks/counts', {
        body: { pending: pending.length, done: done.length, total: allActive.length },
      });
    });
  }

  beforeEach(() => {
    cy.login();
    cy.interceptApi();
  });

  describe('with tasks', () => {
    beforeEach(() => {
      setupTaskIntercepts();
      cy.visit('/active');
    });

    it('displays "Active" heading', () => {
      cy.contains('h1', 'Active').should('be.visible');
    });

    it('shows pending tasks', () => {
      // task-001, task-002, task-004 are pending + non-archived + non-reported + non-snoozed
      cy.contains('Send cap table to Roelof').should('be.visible');
      cy.contains('Review Acme v3 deck').should('be.visible');
      cy.contains('Follow up with LP on commitment').should('be.visible');
    });

    it('shows "Pending" section header with count', () => {
      cy.contains('Pending (3)').should('be.visible');
    });

    it('shows "Done" section header', () => {
      cy.contains('Done (1)').should('be.visible');
    });

    it('clicking Done expands done tasks section', () => {
      // In list view, done section is collapsed by default
      cy.contains('Prepare board deck').should('not.exist');
      cy.contains('Done (1)').click();
      cy.contains('Prepare board deck').should('be.visible');
    });

    it('task card shows title, source chip, and priority pill', () => {
      // task-001: high priority, gmail source
      cy.contains('Send cap table to Roelof').should('be.visible');
      cy.contains('Gmail').should('exist');
      cy.contains('High').should('exist');
    });

    it('view toggle switches between list and kanban view', () => {
      // Default is list view — check pending section header exists
      cy.contains('Pending (3)').should('be.visible');

      // Switch to kanban view
      cy.get('button[title="Kanban view"]').click();

      // Mobile kanban shows "Pending (N)" in the column header
      cy.contains('Pending (3)').should('be.visible');

      // Switch back to list view
      cy.get('button[title="List view"]').click();
      cy.contains('Pending (3)').should('be.visible');
    });

    it('completing a task via checkbox', () => {
      cy.intercept('POST', '/api/tasks/*/complete', {
        statusCode: 200,
        body: {},
      }).as('completeTask');

      // Click the first "Mark complete" checkbox
      cy.get('button[aria-label="Mark complete"]').first().click();
      cy.wait('@completeTask');
    });
  });

  describe('empty state', () => {
    it('shows empty state when no tasks', () => {
      // interceptApi already returns empty data for all routes
      cy.visit('/active');
      cy.contains('all caught up').should('be.visible');
    });
  });
});
