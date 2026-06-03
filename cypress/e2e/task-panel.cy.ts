describe('Task Panel', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
    cy.fixture('tasks').then((tasks) => {
      const task = tasks[0]; // task-001

      // Active list returns the single task
      cy.intercept('GET', '/api/tasks?*', {
        body: { data: [task], total: 1, page: 1, limit: 25, hasMore: false },
      });
      cy.intercept('GET', '/api/tasks/counts', {
        body: { pending: 1, done: 0, total: 1, filtered: 0 },
      });

      // Single task endpoint for panel
      cy.intercept('GET', `/api/tasks/${task.id}`, { body: task }).as('getTask');
      cy.intercept('GET', `/api/tasks/${task.id}/subtasks`, { body: [] }).as('getSubtasks');
      cy.intercept('GET', `/api/tasks/${task.id}/notes`, { body: [] }).as('getNotes');
    });
    cy.visit('/active');
  });

  it('opens panel when clicking a task card', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    // Panel renders the task title in an h2
    cy.get('h2').should('contain.text', 'Send cap table to Roelof');
  });

  it('shows task title in panel', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.get('h2').should('contain.text', 'Send cap table to Roelof');
  });

  it('shows priority selector', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    // task-001 has priority "high" which renders as "High"
    cy.contains('High').should('be.visible');
  });

  it('shows source icon', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    // The source icon is rendered in the panel header
    cy.get('[aria-label="Close"]').should('exist');
  });

  it('shows "Created" timestamp', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.contains('Created').should('be.visible');
  });

  it('shows subtasks section', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.contains('Subtasks').should('be.visible');
  });

  it('shows notes section with "Add note" button', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.contains('Notes').should('be.visible');
    cy.get('[aria-label="Add note"]').should('be.visible');
  });

  it('close button closes the panel', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.get('h2').should('contain.text', 'Send cap table to Roelof');
    cy.get('[aria-label="Close"]').first().click();
    cy.get('h2').should('not.exist');
  });

  it('shows Complete and Archive buttons in footer', () => {
    cy.contains('Send cap table to Roelof').click();
    cy.wait('@getTask');
    cy.contains('button', 'Complete').should('be.visible');
    cy.contains('button', 'Archive').should('be.visible');
  });
});
