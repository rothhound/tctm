describe('Snoozed', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
    cy.fixture('tasks').then((tasks) => {
      // Snoozed = a task with a future reminder (not archived/reported); bucket is no longer used.
      cy.intercept('GET', '/api/tasks/snoozed', {
        body: tasks.filter((t: any) => t.reminderAt && !t.archived && !t.reported),
      }).as('getSnoozed');
    });
    cy.visit('/snoozed');
  });

  it('displays snoozed heading with count', () => {
    cy.get('h1').should('contain.text', 'Snoozed (1)');
  });

  it('shows snoozed task title', () => {
    cy.contains('Snoozed until next week').should('be.visible');
  });

  it('shows "Returns" date', () => {
    cy.contains('Returns').should('be.visible');
  });

  it('shows "Wake up" button', () => {
    cy.contains('button', 'Wake up').should('be.visible');
  });

  it('clicking "Wake up" calls clearReminder API', () => {
    cy.intercept('DELETE', '/api/tasks/task-007/remind', {
      statusCode: 204,
    }).as('clearReminder');

    cy.contains('button', 'Wake up').click();
    cy.wait('@clearReminder');
  });

  it('shows empty state when no snoozed tasks', () => {
    cy.intercept('GET', '/api/tasks/snoozed', { body: [] }).as('getSnoozedEmpty');
    cy.visit('/snoozed');
    cy.contains('No snoozed tasks').should('be.visible');
  });
});
