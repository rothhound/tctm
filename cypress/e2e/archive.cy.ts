describe('Archive', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
    cy.fixture('tasks').then((tasks) => {
      cy.intercept('GET', '/api/tasks/archived', {
        body: tasks.filter((t: any) => t.archived),
      }).as('getArchived');
    });
    cy.visit('/archive');
  });

  it('displays archive heading with count', () => {
    cy.get('h1').should('contain.text', 'Archive (1)');
  });

  it('shows archived task title', () => {
    cy.contains('Old archived task').should('be.visible');
  });

  it('shows "Archived" date on card', () => {
    cy.contains('Old archived task').should('be.visible');
    // The card renders an "Archived <date>" label (only one archived task in the fixture)
    cy.contains(/^Archived /).should('be.visible');
  });

  it('shows "Restore" button on each card', () => {
    cy.contains('button', 'Restore').should('be.visible');
  });

  it('clicking Restore calls unarchive API', () => {
    cy.intercept('POST', '/api/tasks/task-005/unarchive', {
      statusCode: 200,
      body: {},
    }).as('unarchiveTask');

    cy.contains('button', 'Restore').click();
    cy.wait('@unarchiveTask');
  });

  it('shows empty state when no archived tasks', () => {
    cy.intercept('GET', '/api/tasks/archived', { body: [] }).as('getArchivedEmpty');
    cy.visit('/archive');
    cy.contains('Nothing archived yet').should('be.visible');
  });
});
